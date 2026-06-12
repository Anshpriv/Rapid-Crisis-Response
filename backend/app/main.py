from __future__ import annotations

import asyncio
from datetime import datetime, timezone

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
    return {"message": "Rapid Crisis Response backend online"}


@api.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


ALERT_DEPARTMENT_MAP: dict[str, set[str]] = {
    "medical": {"medical", "medicine", "manager", "general"},
    "security": {"security", "manager", "general"},
    "distress": {"general", "manager"},
    "fire": {"manager"},
}


@api.post("/api/register-device")
async def register_device_route(payload: RegisterDeviceRequest):
    try:
        saved = register_device(payload.role, payload.fcm_token, department=payload.department)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return saved


async def notify_staff_for_incident(incident: dict) -> None:
    alert_type = incident.get("type")
    target_departments = ALERT_DEPARTMENT_MAP.get(alert_type, {"manager"})

    try:
        db = _get_db()
        devices_ref = db.collection("staff_devices").stream()
        title = f"EMERGENCY: {alert_type.upper()} at Room {incident.get('room')}"
        brief = incident.get("gemini_brief")
        body = (brief.get("summary") if isinstance(brief, dict) else brief) or "Immediate response required."

        tasks = []
        for doc in devices_ref:
            device = doc.to_dict()
            device_dept = device.get("department") or device.get("role")
            if device_dept in target_departments:
                tasks.append(send_notification(device["fcm_token"], title, body))
        if tasks:
            await asyncio.gather(*tasks)
    except Exception as exc:
        print(f"Notify staff error: {exc}")


async def escalation_timer(incident_id: str, db) -> None:
    print(f"[ESCALATION] Timer started for incident {incident_id}", flush=True)
    await asyncio.sleep(90)

    print(
        f"[ESCALATION] Timer fired for incident {incident_id}, checking status...",
        flush=True,
    )

    try:
        doc = db.collection("incidents").document(incident_id).get()
        if not doc.exists:
            return

        incident = doc.to_dict()
        if incident.get("status") != "active":
            return

        print(
            f"[ESCALATION] Status is {incident.get('status')}, proceeding to notify...",
            flush=True,
        )
        escalation_message = gemini_service.generate_escalation_message(incident)
        title = f"ESCALATION: Unacknowledged {incident.get('type','').upper()} at Room {incident.get('room')}"
        body = escalation_message or "Alert unacknowledged for 90 seconds. Immediate manager action required."

        devices_ref = db.collection("staff_devices").stream()
        tasks = []
        for doc in devices_ref:
            device = doc.to_dict()
            device_dept = device.get("department") or device.get("role")
            if device_dept == "manager":
                print(f"[ESCALATION] Queueing FCM to manager device {device.get('fcm_token', '')[:20]}...", flush=True)
                tasks.append(send_notification(device["fcm_token"], title, body))
        
        if tasks:
            await asyncio.gather(*tasks)
            print(f"[ESCALATION] Sent escalation notifications to {len(tasks)} manager device(s)", flush=True)

    except Exception as exc:
        print(f"Escalation error: {exc}")


@api.post("/api/alert")
async def create_alert(payload: AlertCreateRequest):
    room = payload.room.strip()
    device_name = payload.device_name.strip()

    if not room or not device_name:
        raise HTTPException(status_code=400, detail="room and device_name are required.")

    incident_payload = {
        "type": payload.type.value,
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

    # Broadcast to all connected dashboards; each client role-filters what it displays.
    await sio.emit("new_alert", created)

    async def process_alert_background(incident):
        try:
            brief = gemini_service.generate_alert_brief(incident)
            with_brief = update_incident(incident["id"], {"gemini_brief": brief})
            final_incident = with_brief or incident

            await sio.emit("alert_updated", final_incident)

            await notify_staff_for_incident(final_incident)
        except Exception as e:
            print(f"Error in background alert processing: {e}")

    asyncio.create_task(process_alert_background(created))
    asyncio.create_task(escalation_timer(created["id"], _get_db()))
    return created


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

    try:
        updated = update_incident(alert_id, updates)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Alert not found.")

    await sio.emit("alert_updated", updated)
    return updated


@api.get("/api/risk-insights")
async def risk_insights():
    try:
        incidents = get_recent_incidents(days=30)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    report = gemini_service.generate_risk_insights(incidents)
    report["generated_at"] = datetime.now(timezone.utc).isoformat()
    report["incidents_analyzed"] = len(incidents)
    return report


app = socketio.ASGIApp(sio, other_asgi_app=api)
