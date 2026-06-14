from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import google.generativeai as genai

from app.config import settings


class GeminiService:
    def __init__(self) -> None:
        self.enabled = bool(settings.gemini_api_key)
        self.model_name = settings.gemini_model
        self._model = None

        if self.enabled:
            genai.configure(api_key=settings.gemini_api_key)
            self._model = genai.GenerativeModel(self.model_name)

    @staticmethod
    def _extract_json_object(text: str) -> dict[str, Any]:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise ValueError("Gemini response did not contain a JSON object.")

        return json.loads(match.group(0))

    @staticmethod
    def _fallback_actions(alert_type: str) -> list[str]:
        action_map = {
            "medical": [
                "Dispatch the nearest first-aid trained staff member to the room immediately.",
                "Contact emergency medical services if the guest is unresponsive or in severe distress.",
                "Secure hallway access and prepare venue records for paramedics.",
            ],
            "fire": [
                "Trigger internal fire response protocol and alert on-site safety leads.",
                "Direct nearby guests and staff to the nearest safe exit without using lifts.",
                "Confirm fire suppression equipment status and call emergency fire services.",
            ],
            "security": [
                "Send trained security personnel to assess and contain the situation.",
                "Move nearby guests and staff to a safe zone away from the incident area.",
                "Notify local authorities with a concise incident summary and location details.",
            ],
            "distress": [
                "Dispatch a duty manager and support staff to establish calm communication.",
                "Assess whether medical, security, or welfare escalation is required.",
                "Create a controlled perimeter to minimize crowding and confusion.",
            ],
        }
        return action_map.get(alert_type, action_map["distress"])

    def _fallback_alert_brief(self, alert: dict[str, Any]) -> dict[str, Any]:
        alert_type = str(alert.get("type", "distress"))
        room = alert.get("room", "unknown room")
        device_name = alert.get("device_name", "unknown device")
        guest_description = (alert.get("guest_description") or "").strip()

        # When Gemini is unavailable (e.g. rate-limited), still surface the
        # guest's own words instead of generic boilerplate.
        if guest_description:
            summary = (
                f"A {alert_type} alert was triggered in room {room}. "
                f"Guest reported: \"{guest_description}\". "
                "Treat this as a live incident and coordinate response resources immediately."
            )
        else:
            summary = (
                f"A {alert_type} alert was triggered in room {room} by device {device_name}. "
                "Treat this as a live incident and coordinate response resources immediately. "
                "Stabilize the area while maintaining guest safety and clear communication."
            )

        return {
            "summary": summary,
            "recommended_actions": self._fallback_actions(alert_type)[:3],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": "fallback",
        }

    def _normalize_alert_brief(self, candidate: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
        summary = str(candidate.get("summary", "")).strip()
        actions = candidate.get("recommended_actions", [])

        if not isinstance(actions, list):
            actions = []

        cleaned_actions = [str(action).strip() for action in actions if str(action).strip()]
        if len(cleaned_actions) < 3:
            cleaned_actions.extend(fallback["recommended_actions"])

        if not summary:
            summary = fallback["summary"]

        return {
            "summary": summary,
            "recommended_actions": cleaned_actions[:3],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": self.model_name if self.enabled else "fallback",
        }

    def generate_alert_brief(self, alert: dict[str, Any]) -> dict[str, Any]:
        fallback = self._fallback_alert_brief(alert)
        if not self.enabled or self._model is None:
            return fallback

        prompt = (
            "You are an emergency operations analyst for hospitality venues. "
            "Given the incident details, return only JSON with this exact schema: "
            '{"summary":"2-3 sentence situation brief",'
            '"recommended_actions":["action 1","action 2","action 3"]}. '\
            "Do not include markdown or extra keys.\n"
            f"Incident type: {alert.get('type')}\n"
            f"Room: {alert.get('room')}\n"
            f"Device: {alert.get('device_name')}\n"
            f"Timestamp: {alert.get('timestamp')}\n"
            f"Status: {alert.get('status')}"
            + (
                f"\nGuest description (may be any language — translate to English "
                f"and use as primary context for the brief): {alert.get('guest_description')}\n"
                if alert.get('guest_description')
                else ""
            )
        )

        try:
            response = self._model.generate_content(prompt)
            candidate = self._extract_json_object(getattr(response, "text", "") or "")
            return self._normalize_alert_brief(candidate, fallback)
        except Exception:  # pragma: no cover - external dependency
            return fallback

    _VALID_TYPES = {"medical", "fire", "security", "distress"}

    def _normalize_types(self, raw_primary: Any, raw_secondary: Any, incident: dict) -> tuple[str, list[str]]:
        """Resolve a single primary type plus a clean list of secondary hazards."""
        primary = str(raw_primary or "").strip().lower()
        if primary not in self._VALID_TYPES:
            existing = str(incident.get("type") or "").strip().lower()
            primary = existing if existing in self._VALID_TYPES else "distress"

        if not isinstance(raw_secondary, list):
            raw_secondary = []

        secondary: list[str] = []
        for item in raw_secondary:
            value = str(item).strip().lower()
            if value in self._VALID_TYPES and value != primary and value not in secondary:
                secondary.append(value)

        return primary, secondary

    def dispatch_incident(self, incident: dict, available_staff: list[dict]) -> dict:
        fallback_assignments = [{"staff_uid": None, "name": "Manager",
                                 "task": "No available staff — direct manager response required",
                                 "priority": 1}]

        if not self.enabled or not self._model:
            primary, secondary = self._normalize_types(incident.get("type"), [], incident)
            return {"primary_type": primary, "secondary_types": secondary, "assignments": fallback_assignments}

        staff_context = "\n".join([
            f"- {s.get('name','Unknown')} | qualifications: {s.get('qualifications',[])} | "
            f"floor: {s.get('floor','unknown')} | uid: {s.get('uid')}"
            for s in available_staff
            if s.get('uid')
        ]) or "No staff available"

        prompt = (
            "You are an emergency dispatch AI for a hospitality venue. "
            "Classify the incident if type is null, then assign available staff optimally.\n"
            "Rules:\n"
            "- Match qualifications to incident type\n"
            "- Choose ONE primary_type — the single most urgent/dominant hazard\n"
            "- List any additional hazards in secondary_types (e.g. smoke + chest pain -> primary medical, secondary [fire])\n"
            "- Assign specific actionable task per person\n"
            "- Load balance: assign max 1 primary, 1-2 secondary\n"
            "- If description implies multiple types, assign roles covering both primary and secondary hazards\n"
            "- If secondary_types is non-empty, assign qualified staff for those hazard types too — "
            "each as separate assignment entries with appropriate priority (P2 if primary hazard already covered)\n"
            "- If no qualified staff, assign best available as general responder\n\n"
            f"Incident type: {incident.get('type') or 'NOT SELECTED — classify from description'}\n"
            f"Room: {incident.get('room')}\n"
            f"Guest description: {incident.get('guest_description') or 'none provided'}\n\n"
            f"Available staff:\n{staff_context}\n\n"
            "Return ONLY valid JSON, no markdown:\n"
            '{"primary_type":"medical|fire|security|distress",'
            '"secondary_types":["fire"],'
            '"summary":"2-3 sentence English brief",'
            '"recommended_actions":["a1","a2","a3"],'
            '"assignments":[{"staff_uid":"uid","name":"name","task":"specific task","priority":1}],'
            '"load_balance_note":"brief note on exclusions"}'
        )

        try:
            response = self._model.generate_content(prompt)
            result = self._extract_json_object(getattr(response, "text", "") or "")
            primary, secondary = self._normalize_types(
                result.get("primary_type") or result.get("classified_type"),
                result.get("secondary_types"),
                incident,
            )
            result["primary_type"] = primary
            result["secondary_types"] = secondary
            if not result.get("assignments"):
                result["assignments"] = fallback_assignments
            return result
        except Exception:
            primary, secondary = self._normalize_types(incident.get("type"), [], incident)
            return {
                "primary_type": primary,
                "secondary_types": secondary,
                "summary": self._fallback_alert_brief(incident)["summary"],
                "recommended_actions": self._fallback_actions(primary),
                "assignments": fallback_assignments
            }

    def _fallback_classify_brief(self, alert: dict[str, Any]) -> dict[str, Any]:
        brief = self._fallback_alert_brief({**alert, "type": "distress"})
        return {
            "classified_type": "distress",
            "summary": brief["summary"],
            "recommended_actions": brief["recommended_actions"],
        }

    def classify_and_brief(self, alert: dict[str, Any]) -> dict[str, Any]:
        fallback = self._fallback_classify_brief(alert)
        if not self.enabled or self._model is None:
            return fallback

        prompt = (
            "You are an emergency classifier for a hospitality venue. \n"
            "A guest triggered an emergency without selecting a type.\n"
            "Based only on their description, do two things:\n"
            "1. Classify as exactly one of: medical, fire, security, distress\n"
            "2. Generate a situation brief and 3 recommended actions\n\n"
            "Guest description (may be any language — translate to English): \n"
            f"{alert.get('guest_description')}\n\n"
            "Return ONLY valid JSON, no markdown:\n"
            "{\n"
            '  "classified_type": "medical|fire|security|distress",\n'
            '  "summary": "2-3 sentence English brief",\n'
            '  "recommended_actions": ["action1", "action2", "action3"]\n'
            "}"
        )

        try:
            response = self._model.generate_content(prompt)
            candidate = self._extract_json_object(getattr(response, "text", "") or "")

            classified_type = str(candidate.get("classified_type", "")).strip().lower()
            if classified_type not in {"medical", "fire", "security", "distress"}:
                classified_type = "distress"

            summary = str(candidate.get("summary", "")).strip() or fallback["summary"]

            actions = candidate.get("recommended_actions", [])
            if not isinstance(actions, list):
                actions = []
            cleaned_actions = [str(action).strip() for action in actions if str(action).strip()]
            if len(cleaned_actions) < 3:
                cleaned_actions.extend(self._fallback_actions(classified_type))

            return {
                "classified_type": classified_type,
                "summary": summary,
                "recommended_actions": cleaned_actions[:3],
            }
        except Exception:  # pragma: no cover - external dependency
            return fallback

    @staticmethod
    def _fallback_escalation_message(incident: dict) -> str:
        alert_type = str(incident.get("type", "distress")).upper()
        room = incident.get("room", "unknown room")
        return (
            f"ESCALATION: A {alert_type} alert in Room {room} has been unacknowledged "
            "for 90 seconds. No staff member has responded. Immediate manager intervention "
            "is required. Verify responder availability and take direct control of the situation."
        )

    def generate_escalation_message(self, incident: dict) -> str:
        fallback = self._fallback_escalation_message(incident)
        if not self.enabled or self._model is None:
            return fallback

        prompt = (
            "You are an emergency operations system. A hospitality emergency alert "
            "has gone unacknowledged for 90 seconds. Write a single urgent escalation "
            "message (2-3 sentences, plain text, no JSON, no markdown) to send to the "
            "duty manager. Be direct and action-oriented.\n"
            f"Alert type: {incident.get('type')}\n"
            f"Room: {incident.get('room')}\n"
            f"Device: {incident.get('device_name')}\n"
            f"Time of alert: {incident.get('timestamp')}"
        )

        try:
            response = self._model.generate_content(prompt)
            text = (getattr(response, "text", "") or "").strip()
            return text if text else fallback
        except Exception:
            return fallback

    def generate_authority_brief(self, incident: dict) -> str:
        authority_map = {
            "fire": "Fire Department",
            "security": "Security Department",
            "distress": "Emergency Services",
            "medical": "Medical Department",
        }
        primary = incident.get("type", "distress")
        authority = authority_map.get(primary, "Emergency Services")
        room = incident.get("room", "unknown")

        fallback = (
            f"EMERGENCY ALERT — {primary.upper()} incident in Room {room}. "
            f"No staff response for 5 minutes. Immediate {authority} response required."
        )

        if not self.enabled or not self._model:
            return fallback

        prompt = (
            f"You are an emergency dispatch system at a hospitality venue. "
            f"Generate a concise emergency SMS to send to {authority}. "
            f"Plain text only, 2-3 sentences max, no markdown.\n"
            f"Incident type: {primary}\n"
            f"Secondary hazards: {incident.get('secondary_types', [])}\n"
            f"Room: {room}\n"
            f"Guest description: {incident.get('guest_description', 'none')}\n"
            f"Time unresolved: 5 minutes"
        )
        try:
            response = self._model.generate_content(prompt)
            text = (getattr(response, "text", "") or "").strip()
            return text if text else fallback
        except Exception:
            return fallback

    @staticmethod
    def _fallback_risk_insights(incidents: list[dict[str, Any]]) -> dict[str, Any]:
        counts = Counter(str(item.get("type", "unknown")) for item in incidents)
        ordered = counts.most_common()

        if not ordered:
            return {
                "headline": "No significant incident trends detected in the last 30 days.",
                "analysis": "Insufficient incident data is available for a meaningful pattern analysis.",
                "high_risk_patterns": ["Collect additional data to establish baseline risk patterns."],
                "recommendations": [
                    "Run regular panic button drills across all departments.",
                    "Confirm every venue zone has a designated emergency responder.",
                    "Audit device health and timestamp accuracy weekly.",
                ],
            }

        top_type, top_count = ordered[0]
        headline = f"{top_type.title()} alerts are the most frequent pattern ({top_count} cases)."
        analysis = (
            "Recent incidents show concentration around a limited set of emergency categories. "
            "Response consistency should be prioritized for recurring alert types while reviewing location-specific triggers. "
            "Focused preparedness on the dominant pattern will produce the fastest resilience gains."
        )

        patterns = [f"{incident_type.title()} incidents: {count}" for incident_type, count in ordered[:4]]
        recommendations = [
            "Run targeted scenario drills for the highest-frequency alert types.",
            "Review staffing coverage in rooms with repeated activations.",
            "Introduce rapid post-incident debriefs to reduce repeat triggers.",
        ]

        return {
            "headline": headline,
            "analysis": analysis,
            "high_risk_patterns": patterns,
            "recommendations": recommendations,
        }

    @staticmethod
    def _normalize_risk_insights(candidate: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
        headline = str(candidate.get("headline", "")).strip() or fallback["headline"]
        analysis = str(candidate.get("analysis", "")).strip() or fallback["analysis"]

        high_risk_patterns = candidate.get("high_risk_patterns", [])
        if not isinstance(high_risk_patterns, list):
            high_risk_patterns = []

        recommendations = candidate.get("recommendations", [])
        if not isinstance(recommendations, list):
            recommendations = []

        cleaned_patterns = [str(item).strip() for item in high_risk_patterns if str(item).strip()]
        cleaned_recommendations = [
            str(item).strip() for item in recommendations if str(item).strip()
        ]

        if not cleaned_patterns:
            cleaned_patterns = fallback["high_risk_patterns"]

        if len(cleaned_recommendations) < 3:
            cleaned_recommendations.extend(fallback["recommendations"])

        return {
            "headline": headline,
            "analysis": analysis,
            "high_risk_patterns": cleaned_patterns[:5],
            "recommendations": cleaned_recommendations[:5],
            "model": settings.gemini_model if settings.gemini_api_key else "fallback",
        }

    def generate_risk_insights(self, incidents: list[dict[str, Any]]) -> dict[str, Any]:
        fallback = self._fallback_risk_insights(incidents)
        if not self.enabled or self._model is None:
            return fallback

        reduced_incidents = [
            {
                "type": incident.get("type"),
                "room": incident.get("room"),
                "device_name": incident.get("device_name"),
                "timestamp": incident.get("timestamp"),
                "status": incident.get("status"),
            }
            for incident in incidents[:150]
        ]

        # Pre-compute exact counts in Python so Gemini cannot miscount. The type
        # breakdown is by PRIMARY type only — secondary_types are not double-counted.
        type_counts = Counter(incident.get("type") for incident in incidents)
        status_counts = Counter(incident.get("status") for incident in incidents)

        prompt = (
            "You are a hospitality safety analyst. Analyze this incident dataset and produce "
            "a specific, data-driven risk report. Do NOT use generic statements. "
            "Reference actual numbers, specific alert types, and patterns you see in the data.\n"
            "Use the EXACT counts provided below for all numbers in your report. "
            "Do not recalculate or estimate counts from the dataset.\n"
            "Rules:\n"
            "- headline must reference the dominant type AND exact count\n"
            "- if two types are tied, call that out explicitly\n"
            "- analysis must reference specific rooms or devices if repeated\n"
            "- high_risk_patterns must list each type with count and % of total\n"
            "- recommendations must be specific to the patterns found, not generic\n"
            f"Total incidents: {len(incidents)}\n"
            f"Incident type breakdown (exact counts, primary type only): {dict(type_counts)}\n"
            f"Status breakdown (exact counts): {dict(status_counts)}\n"
            f"Full dataset (for pattern analysis only): {json.dumps(reduced_incidents)}\n\n"
            "Return ONLY valid JSON:\n"
            '{"headline":"...","analysis":"...","high_risk_patterns":["..."],"recommendations":["..."]}'
        )

        try:
            response = self._model.generate_content(prompt)
            candidate = self._extract_json_object(getattr(response, "text", "") or "")
            return self._normalize_risk_insights(candidate, fallback)
        except Exception:  # pragma: no cover - external dependency
            return fallback


gemini_service = GeminiService()
