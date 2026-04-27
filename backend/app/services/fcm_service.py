from __future__ import annotations

import os
import logging

import firebase_admin
import firebase_admin.credentials as credentials
import firebase_admin.messaging as messaging

logger = logging.getLogger(__name__)

if not firebase_admin._apps:
    import json
    creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
    key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH")
    if creds_json:
        creds_dict = json.loads(creds_json)
        cred = credentials.Certificate(creds_dict)
        firebase_admin.initialize_app(cred)
    elif key_path:
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()


async def send_notification(token: str, title: str, body: str) -> None:
    message = messaging.Message(
        token=token,
        notification=messaging.Notification(title=title, body=body),
        android=messaging.AndroidConfig(priority="high"),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(aps=messaging.Aps(sound="default"))
        ),
    )

    try:
        firebase_admin.get_app()
        message_id = messaging.send(message)
        logger.info("FCM sent: %s", message_id)
    except Exception as exc:  # pragma: no cover - external dependency
        logger.error("FCM failed: %s", exc)


__all__ = ["send_notification"]