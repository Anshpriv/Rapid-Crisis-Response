from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import socketio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import AlertCreateRequest, AlertStatus, AlertUpdateRequest, RegisterDeviceRequest
from app.services.fcm_service import send_notification
from app.services.firestore_service import (
    _get_db,
    create_incident,
    get_recent_incidents,
    list_incidents,
    register_device,
    update_incident,
    get_available_staff,
    assign_staff,
    release_staff,
    release_staff_for_incident,
    upsert_staff_availability,
    heartbeat,
    mark_stale_staff_unavailable,
    append_incident_event,
)
from app.services.gemini_service import gemini_service

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=settings.allowed_origins)
api = FastAPI(title="Rapid Crisis Response API", version="0.1.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None):
    department = (auth or {}).get("department", "general")
    await sio.enter_room(sid, department)
    return True


@sio.event
async def disconnect(sid: str):
    return None


@api.get("/")
async def root() -> dict[str, str]:
    return {"message": "Rapid Crisis Response backend online v2"}


@api.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@api.post("/api/availability")
async def set_availability(payload: dict):
    uid = payload.get("uid")
    is_available = payload.get("is_available", True)
    if not uid:
        raise HTTPException(status_code=400, detail="uid required")
    upsert_staff_availability(uid, is_available)
    return {"ok": True}


@api.post("/api/heartbeat")
async def staff_heartbeat(payload: dict):
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="uid required")
    heartbeat(uid)
    return {"ok": True}


ALERT_DEPARTMENT_MAP: dict[str, set[str]] = {
    "medical": {"medical", "medicine", "manager", "general"},
    "security": {"security", "manager", "general"},
    "distress": {"general", "manager"},
    "fire": {"manager"},
}


@api.post("/api/register-device")
async def register_device_route(payload: RegisterDeviceRequest):
    try:
        saved = register_device(
            payload.role,
            payload.fcm_token,
            department=payload.department,
            staff_profile_id=payload.uid,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return saved


async def notify_staff_for_incident(incident: dict) -> None:
    try:
        db = _get_db()
        mark_stale_staff_unavailable()
        available = get_available_staff()
        dispatch = gemini_service.dispatch_incident(incident, available)

        # Primary type drives FCM routing + the dashboard pill; secondary hazards
        # are supplementary tags shown alongside it.
        primary_type = dispatch.get("primary_type") or incident.get("type") or "distress"
        secondary_types = dispatch.get("secondary_types", [])
        gemini_brief = {
            "summary": dispatch.get("summary", ""),
            "recommended_actions": dispatch.get("recommended_actions", []),
            "assignments": dispatch.get("assignments", []),
            "load_balance_note": dispatch.get("load_balance_note", ""),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": settings.gemini_model,
        }

        update_incident(incident["id"], {
            "type": primary_type,
            "secondary_types": secondary_types,
            "gemini_brief": gemini_brief
        })
        await sio.emit("alert_updated", {
            **incident,
            "type": primary_type,
            "secondary_types": secondary_types,
            "gemini_brief": gemini_brief,
        })

        notified_any = False
        for assignment in dispatch.get("assignments", []):
            uid = assignment.get("staff_uid")
            if uid:
                assign_staff(uid, incident["id"])
                devices = db.collection("staff_devices").where("staff_profile_id", "==", uid).stream()
                for dev in devices:
                    token = dev.to_dict().get("fcm_token")
                    if token:
                        await send_notification(
                            token,
                            f"ASSIGNED: {primary_type.upper()} Room {incident.get('room')}",
                            assignment["task"]
                        )
                        notified_any = True

        # Fallback broadcast: if no individual assignment could be notified
        # (no staff_uid, or assigned staff have no linked device), alert every
        # on-duty device whose role covers ANY hazard type — primary OR secondary
        # — plus managers, so multi-hazard incidents reach all relevant teams.
        if not notified_any:
            all_types = [primary_type] + (secondary_types or [])
            target_roles: set[str] = set()
            for t in all_types:
                target_roles.update(ALERT_DEPARTMENT_MAP.get(t, set()))
            target_roles.add("manager")  # always include

            title = f"EMERGENCY: {primary_type.upper()} Room {incident.get('room')}"
            body = gemini_brief.get("summary") or "Immediate response required."
            for dev in db.collection("staff_devices").stream():
                device = dev.to_dict()
                device_role = device.get("department") or device.get("role")
                token = device.get("fcm_token")
                if token and device_role in target_roles:
                    await send_notification(token, title, body)
    except Exception as exc:
        print(f"Dispatch error: {exc}")


async def escalation_timer(incident_id: str, db) -> None:
    await asyncio.sleep(90)

    try:
        doc = db.collection("incidents").document(incident_id).get()
        if not doc.exists:
            return

        incident = doc.to_dict()
        if incident.get("status") != "active":
            return

        append_incident_event(incident_id, "No staff response within 90s — escalated to manager")
        escalation_message = gemini_service.generate_escalation_message(incident)
        title = f"ESCALATION: Unacknowledged {incident.get('type','').upper()} at Room {incident.get('room')}"
        body = escalation_message or "Alert unacknowledged for 90 seconds. Immediate manager action required."

        devices_ref = db.collection("staff_devices").stream()
        tasks = []
        for doc in devices_ref:
            device = doc.to_dict()
            device_dept = device.get("department") or device.get("role")
            if device_dept == "manager":
                tasks.append(send_notification(device["fcm_token"], title, body))

        if tasks:
            await asyncio.gather(*tasks)

    except Exception as exc:
        print(f"Escalation error: {exc}")

    # wait additional 210 seconds (total 300s from alert creation)
    await asyncio.sleep(210)

    try:
        doc = _get_db().collection("incidents").document(incident_id).get()
        if not doc.exists:
            return
        incident = doc.to_dict()
        if incident.get("status") == "resolved":
            return

        authority_map = {
            "fire": "Fire Department",
            "security": "Security Department",
            "distress": "Emergency Services",
            "medical": "Medical Department",
        }
        primary = incident.get("type", "distress")
        authority = authority_map.get(primary, "Emergency Services")
        sms_text = gemini_service.generate_authority_brief(incident)

        # MOCK: log SMS instead of real Twilio call
        print(f"[SMS MOCK] To: {authority} | Message: {sms_text}", flush=True)

        append_incident_event(incident_id, "No manager response within 5 min")
        append_incident_event(incident_id, f"SMS dispatched to {authority}")

        # write to Firestore so dashboard can reflect it (returns a
        # JSON-safe serialized snapshot for the Socket.IO broadcast)
        updated = update_incident(incident_id, {
            "authority_notified": True,
            "authority_type": authority,
            "authority_message": sms_text,
            "authority_notified_at": datetime.now(timezone.utc).isoformat()
        })

        await sio.emit("alert_updated", updated or {
            **incident,
            "authority_notified": True,
            "authority_type": authority,
        })

    except Exception as exc:
        print(f"Authority escalation error: {exc}")


@api.post("/api/alert")
async def create_alert(payload: AlertCreateRequest):
    room = payload.room.strip()
    device_name = payload.device_name.strip()

    if not room or not device_name:
        raise HTTPException(status_code=400, detail="room and device_name are required.")

    incident_payload = {
        "type": payload.type.value if payload.type else None,
        "secondary_types": [],
        "room": room,
        "device_name": device_name,
        "timestamp": payload.timestamp,
        "status": AlertStatus.active.value,
        "gemini_brief": None,
        "acknowledged_by": None,
        "acknowledged_at": None,
        "guest_description": payload.guest_description,
    }

    try:
        created = create_incident(incident_payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Brief + classification + staff dispatch now happen inside
    # notify_staff_for_incident via gemini_service.dispatch_incident.
    final_incident = created
    append_incident_event(created["id"], "Alert triggered")

    # Broadcast to all connected dashboards; each client role-filters what it displays.
    await sio.emit("new_alert", final_incident)

    async def notify_staff_background(incident):
        try:
            await notify_staff_for_incident(incident)
        except Exception as e:
            print(f"Error in background alert notification: {e}")

    asyncio.create_task(notify_staff_background(final_incident))
    asyncio.create_task(escalation_timer(final_incident["id"], _get_db()))
    return final_incident


@api.get("/api/alerts")
async def get_alerts(status: AlertStatus | None = Query(default=None)):
    try:
        return list_incidents(status=status.value if status else None)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api.patch("/api/alert/{alert_id}")
async def patch_alert(alert_id: str, patch: AlertUpdateRequest):
    updates: dict[str, object] = {}

    if patch.status is not None:
        updates["status"] = patch.status.value

    if patch.acknowledged_by is not None:
        acknowledged_by = patch.acknowledged_by.strip()
        if not acknowledged_by:
            raise HTTPException(status_code=400, detail="acknowledged_by cannot be empty.")
        updates["acknowledged_by"] = acknowledged_by

    if patch.acknowledged_at is not None:
        updates["acknowledged_at"] = patch.acknowledged_at

    if "acknowledged_by" in updates and "acknowledged_at" not in updates:
        updates["acknowledged_at"] = datetime.now(timezone.utc)

    if not updates:
        raise HTTPException(status_code=400, detail="No update fields provided.")

    # Record the acknowledgement in the incident timeline BEFORE the status
    # write, so update_incident's returned snapshot carries the escalation_log.
    actor = updates.get("acknowledged_by") or "staff"
    if updates.get("status") == AlertStatus.responding.value:
        append_incident_event(alert_id, f"Marked responding by {actor}")
    elif updates.get("status") == AlertStatus.resolved.value:
        append_incident_event(alert_id, f"Resolved by {actor}")

    try:
        updated = update_incident(alert_id, updates)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Alert not found.")

    # Free any staff assigned to this incident once it is resolved so they
    # return to the available pool for future dispatch.
    if updates.get("status") == AlertStatus.resolved.value:
        try:
            release_staff_for_incident(alert_id)
        except Exception as exc:
            print(f"Release staff error: {exc}")

    await sio.emit("alert_updated", updated)
    return updated


@api.get("/api/risk-insights")
async def risk_insights():
    try:
        incidents = get_recent_incidents(days=30)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    print(f"[INSIGHTS] Fetched {len(incidents)} incidents for analysis", flush=True)

    report = gemini_service.generate_risk_insights(incidents)
    report["generated_at"] = datetime.now(timezone.utc).isoformat()
    report["incidents_analyzed"] = len(incidents)
    return report


app = socketio.ASGIApp(sio, other_asgi_app=api)
