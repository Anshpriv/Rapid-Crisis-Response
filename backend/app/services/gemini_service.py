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
        )

        try:
            response = self._model.generate_content(prompt)
            candidate = self._extract_json_object(getattr(response, "text", "") or "")
            return self._normalize_alert_brief(candidate, fallback)
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

        prompt = (
            "Analyze the last 30 days of hospitality emergency incidents and return only JSON "
            "with this exact schema: "
            '{"headline":"short title",'
            '"analysis":"short paragraph",'
            '"high_risk_patterns":["pattern 1","pattern 2"],'
            '"recommendations":["recommendation 1","recommendation 2","recommendation 3"]}. '\
            "Focus on actionable operational patterns and response improvements.\n"
            f"Incident dataset: {json.dumps(reduced_incidents)}"
        )

        try:
            response = self._model.generate_content(prompt)
            candidate = self._extract_json_object(getattr(response, "text", "") or "")
            return self._normalize_risk_insights(candidate, fallback)
        except Exception:  # pragma: no cover - external dependency
            return fallback


gemini_service = GeminiService()
