from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import firebase_admin
from firebase_admin import firestore

from app.config import settings

_db: Optional[firestore.Client] = None


def _get_db() -> firestore.Client:
    global _db
    if _db is None:
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app()

        _db = firestore.client()

    return _db


def _collection() -> firestore.CollectionReference:
    return _get_db().collection(settings.firestore_collection)


def _ensure_utc(value: Any) -> Any:
    if not isinstance(value, datetime):
        return value

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return normalized.astimezone(timezone.utc).isoformat()

    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}

    if isinstance(value, list):
        return [_serialize_value(item) for item in value]

    return value


def _serialize_snapshot(snapshot: firestore.DocumentSnapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    serialized = {key: _serialize_value(value) for key, value in data.items()}
    serialized["id"] = snapshot.id
    return serialized


def create_incident(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        record = payload.copy()
        record["timestamp"] = _ensure_utc(record.get("timestamp"))
        record["acknowledged_at"] = _ensure_utc(record.get("acknowledged_at"))

        doc_ref = _collection().document()
        record["id"] = doc_ref.id
        doc_ref.set(record)
        return _serialize_snapshot(doc_ref.get())
    except Exception as exc:  # pragma: no cover - external dependency
        raise RuntimeError("Failed to create incident in Firestore.") from exc


def list_incidents(status: str | None = None, limit: int = 250) -> list[dict[str, Any]]:
    try:
        query = _collection().order_by("timestamp", direction=firestore.Query.DESCENDING)
        if status:
            query = query.where("status", "==", status)

        snapshots = query.limit(limit).stream()
        return [_serialize_snapshot(snapshot) for snapshot in snapshots]
    except Exception as exc:  # pragma: no cover - external dependency
        raise RuntimeError("Failed to load incidents from Firestore.") from exc


def update_incident(incident_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    try:
        doc_ref = _collection().document(incident_id)
        if not doc_ref.get().exists:
            return None

        patched = updates.copy()
        if "timestamp" in patched:
            patched["timestamp"] = _ensure_utc(patched["timestamp"])
        if "acknowledged_at" in patched:
            patched["acknowledged_at"] = _ensure_utc(patched["acknowledged_at"])

        doc_ref.update(patched)
        return _serialize_snapshot(doc_ref.get())
    except Exception as exc:  # pragma: no cover - external dependency
        raise RuntimeError("Failed to update incident in Firestore.") from exc


def get_recent_incidents(days: int = 30, limit: int = 500) -> list[dict[str, Any]]:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = (
            _collection()
            .where("timestamp", ">=", cutoff)
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
        )

        snapshots = query.limit(limit).stream()
        return [_serialize_snapshot(snapshot) for snapshot in snapshots]
    except Exception as exc:  # pragma: no cover - external dependency
        raise RuntimeError("Failed to load recent incidents from Firestore.") from exc


def register_device(role: str, fcm_token: str) -> dict:
    db = _get_db()
    doc_ref = db.collection("staff_devices").document()
    data = {
        "role": role,
        "fcm_token": fcm_token,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    doc_ref.set(data)
    return {"id": doc_ref.id, **data}
