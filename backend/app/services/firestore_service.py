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
            import os
            import json
            from firebase_admin import credentials
            creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if creds_json:
                creds_dict = json.loads(creds_json)
                cred = credentials.Certificate(creds_dict)
                firebase_admin.initialize_app(cred)
            else:
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
        if status:
            # Equality filter only (single-field auto index) — combining where()
            # with order_by() on a different field would require a composite
            # index, so we sort newest-first in Python instead.
            snapshots = _collection().where("status", "==", status).stream()
            results = [_serialize_snapshot(snapshot) for snapshot in snapshots]
            results.sort(key=lambda r: r.get("timestamp") or "", reverse=True)
            return results[:limit]

        snapshots = (
            _collection()
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
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


def append_incident_event(incident_id: str, label: str) -> None:
    """Append a timeline event to the incident's escalation_log (for the dashboard log)."""
    try:
        entry = {"label": label, "at": datetime.now(timezone.utc).isoformat()}
        _collection().document(incident_id).update(
            {"escalation_log": firestore.ArrayUnion([entry])}
        )
    except Exception as exc:  # pragma: no cover - external dependency
        print(f"append_incident_event error: {exc}")


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


def register_device(
    role: str,
    fcm_token: str,
    department: str | None = None,
    staff_profile_id: str | None = None,
) -> dict:
    db = _get_db()
    data = {
        "role": role,
        "department": department if department else role,
        "fcm_token": fcm_token,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    if staff_profile_id:
        data["staff_profile_id"] = staff_profile_id

    # Idempotent: keep exactly one document per FCM token so a single physical
    # device is never notified multiple times. Reuse the existing doc (merging so
    # links like staff_profile_id survive) and prune any duplicate rows.
    existing = list(
        db.collection("staff_devices").where("fcm_token", "==", fcm_token).stream()
    )
    if existing:
        primary = existing[0].reference
        primary.set(data, merge=True)
        for dup in existing[1:]:
            dup.reference.delete()
        return {"id": primary.id, **(primary.get().to_dict() or data)}

    doc_ref = db.collection("staff_devices").document()
    doc_ref.set(data)
    return {"id": doc_ref.id, **data}


def get_available_staff() -> list[dict]:
    db = _get_db()
    docs = db.collection("staff_profiles").where("is_available", "==", True).stream()
    return [{"uid": d.id, **d.to_dict()} for d in docs]


def assign_staff(uid: str, incident_id: str) -> None:
    db = _get_db()
    db.collection("staff_profiles").document(uid).update({
        "is_available": False,
        "current_incident_id": incident_id
    })


def release_staff(uid: str) -> None:
    db = _get_db()
    db.collection("staff_profiles").document(uid).update({
        "is_available": True,
        "current_incident_id": None
    })


def upsert_staff_availability(uid: str, is_available: bool) -> None:
    db = _get_db()
    db.collection("staff_profiles").document(uid).set(
        {"is_available": is_available, "last_seen": datetime.now(timezone.utc).isoformat()},
        merge=True
    )


def heartbeat(uid: str) -> None:
    db = _get_db()
    db.collection("staff_profiles").document(uid).update({
        "last_seen": datetime.now(timezone.utc).isoformat()
    })


def mark_stale_staff_unavailable() -> None:
    db = _get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    docs = db.collection("staff_profiles").where("is_available", "==", True).stream()
    for doc in docs:
        if doc.to_dict().get("last_seen", "") < cutoff:
            doc.reference.update({"is_available": False})


def release_staff_for_incident(incident_id: str) -> list[str]:
    db = _get_db()
    docs = db.collection("staff_profiles").where("current_incident_id", "==", incident_id).stream()
    released: list[str] = []
    for doc in docs:
        doc.reference.update({"is_available": True, "current_incident_id": None})
        released.append(doc.id)
    return released
