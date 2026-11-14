"""Мелочи форматирования, на которых сходятся хранилище и http: ISO-время и хэш токена."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
import hashlib


def iso_time(value: Optional[float]) -> Optional[str]:
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value is not None else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
