from __future__ import annotations

import os
import logging

import firebase_admin
import firebase_admin.credentials as credentials
import firebase_admin.messaging as messaging

logger = logging.getLogger(__name__)

if not firebase_admin._apps:
    cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH"))
    firebase_admin.initialize_app(cred)


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