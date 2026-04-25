from __future__ import annotations

from datetime import datetime, timezone

import socketio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import AlertCreateRequest, AlertStatus, AlertUpdateRequest
from app.services.firestore_service import (
    create_incident,
    get_recent_incidents,
    list_incidents,
    update_incident,
)
from app.services.gemini_service import gemini_service

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=settings.allowed_origins)
api = FastAPI(title="Rapid Crisis Response API", version="0.1.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None):
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
    }

    try:
        created = create_incident(incident_payload)
        brief = gemini_service.generate_alert_brief(created)
        with_brief = update_incident(created["id"], {"gemini_brief": brief})
        final_incident = with_brief or created
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    await sio.emit("new_alert", final_incident)
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
