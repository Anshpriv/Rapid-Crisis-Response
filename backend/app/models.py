from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class AlertType(str, Enum):
    medical = "medical"
    fire = "fire"
    security = "security"
    distress = "distress"


class AlertStatus(str, Enum):
    active = "active"
    responding = "responding"
    resolved = "resolved"


class AlertCreateRequest(BaseModel):
    type: AlertType
    room: str = Field(min_length=1, max_length=10)
    device_name: str = Field(min_length=1, max_length=120)
    timestamp: datetime
    guest_description: str | None = None

    @field_validator("room")
    @classmethod
    def room_must_be_numeric(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("room must contain digits only")
        return v


class AlertUpdateRequest(BaseModel):
    status: Optional[AlertStatus] = None
    acknowledged_by: Optional[str] = Field(default=None, max_length=120)
    acknowledged_at: Optional[datetime] = None


class RegisterDeviceRequest(BaseModel):
    role: Literal["medical", "security", "manager", "general"]
    department: Optional[str] = None
    fcm_token: str
