"""Телеметрия, вход по подписи, устройства и сессии.

Часть `_route_http`: одна функция на домен, порядок вызовов задаёт `router.py`, а
`_NEXT` значит «здесь не нашлось, ищи дальше» — иначе prefix-блоки перестанут
проваливаться сквозь себя, как было в одной длинной цепочке `if`.
"""

import asyncio
import base64
import json
import mimetypes
import os
import secrets
import time
import urllib.parse
from pathlib import Path

import settings
from settings import *
from errors import ApiError
from fmt import hash_token, iso_time
from assistant_card import *
from router import _NEXT


class AuthRoutes:
    async def _route_auth(self, method: str, path: str, query: dict, body: dict,
                     headers: dict, writer):
        if method == "POST" and path == "/api/telemetry/event":
            if not self._allow_request(f"telemetry:{self._client_ip(writer, headers)}", settings.RATE_LIMIT_TELEMETRY):
                return {"error": "too_many_requests"}, 429
            event_type = body.get("eventType", "").strip()
            if not event_type:
                raise ApiError(400, "missing_event_type")
            platform = body.get("platform", "web").strip().lower()
            metadata = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
            event_id = self.db.record_telemetry(event_type, platform, metadata)
            return {"status": "ok", "id": event_id}, 200

        if method == "POST" and path == "/api/auth/challenge":
            if not self._allow_request(f"challenge:{self._client_ip(writer, headers)}", settings.RATE_LIMIT_AUTH_CHALLENGE):
                return {"error": "too_many_requests"}, 429
            account_id = body.get("accountId", "")
            self._validate_account_id(account_id)
            return {"challenge": self.db.create_challenge(account_id), "expiresIn": CHALLENGE_TTL_SECONDS}, 200

        if method == "POST" and path in ("/api/auth/register", "/api/auth/login"):
            account_id = body.get("accountId", "")
            public_key = body.get("publicKey", "")
            challenge = body.get("challenge", "")
            signature = body.get("signature", "")
            device = body.get("device")
            self._validate_device(device)
            if not self.db.consume_challenge(account_id, challenge):
                raise ApiError(401, "invalid_or_expired_challenge")
            self._verify_account_signature(account_id, public_key, challenge, signature)
            if path.endswith("/register"):
                token, expires_at = self.db.register_account(account_id, public_key, device)
                saved_device = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
                return {"token": token, "expiresAt": iso_time(expires_at), "account": self.db.account_payload(account_id),
                        "device": self.db.device_payload(saved_device)}, 201
            account = self.db.conn.execute("SELECT public_key FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
            if not account or account["public_key"] != public_key:
                raise ApiError(401, "invalid_account_credentials")
            existing = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
            if existing and existing["account_id"] == account_id and existing["status"] == "active":
                self._verify_device_signature(existing["public_key"], challenge, body.get("deviceSignature", ""))
            result = self.db.login_account(account_id, device)
            if isinstance(result, dict):
                return {**result, **self.db.create_device_request(account_id, device)}, 202
            token, expires_at = result
            saved_device = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
            return {"token": token, "expiresAt": iso_time(expires_at), "account": self.db.account_payload(account_id),
                    "device": self.db.device_payload(saved_device)}, 200

        if method == "POST" and path.startswith("/api/auth/device-requests/"):
            parts = path.strip("/").split("/")
            if len(parts) != 5 or parts[4] != "complete":
                raise ApiError(404, "not_found")
            request_id = urllib.parse.unquote(parts[3])
            secret = body.get("continuationSecret", "")
            challenge = body.get("challenge", "")
            signature = body.get("deviceSignature", "")
            if not all(isinstance(value, str) and value for value in (secret, challenge, signature)):
                raise ApiError(401, "invalid_device_request_credentials")
            # Consume the challenge and request and mint the session in one transaction.
            with self.db.conn:
                request = self.db.conn.execute("SELECT * FROM pending_auth_requests WHERE id = ?", (request_id,)).fetchone()
                if not request or not secrets.compare_digest(request["secret_hash"], hash_token(secret)):
                    raise ApiError(401, "invalid_device_request_credentials")
                if request["completed_at"] is not None:
                    raise ApiError(409, "device_request_completed")
                consumed = self.db.conn.execute(
                    "DELETE FROM auth_challenges WHERE account_id = ? AND challenge = ? AND expires_at > ?",
                    (request["account_id"], challenge, time.time()))
                if consumed.rowcount != 1:
                    raise ApiError(401, "invalid_or_expired_challenge")
                self._verify_device_signature(request["public_key"], challenge, signature)
                if request["expires_at"] <= time.time():
                    return {"status": "expired"}, 200
                device = self.db.conn.execute("SELECT * FROM devices WHERE id = ?", (request["device_id"],)).fetchone()
                if (not device or device["account_id"] != request["account_id"]
                        or device["public_key"] != request["public_key"] or device["status"] == "revoked"):
                    return {"status": "rejected"}, 200
                if device["status"] != "active":
                    return {"status": "pending"}, 200
                completed = self.db.conn.execute(
                    "UPDATE pending_auth_requests SET completed_at = ? WHERE id = ? AND completed_at IS NULL AND expires_at > ?",
                    (time.time(), request_id, time.time()))
                if completed.rowcount != 1:
                    raise ApiError(409, "device_request_completed")
                token, expires_at = self.db._insert_session(request["account_id"], request["device_id"])
                self.db.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (time.time(), request["device_id"]))
                return {"token": token, "expiresAt": iso_time(expires_at),
                        "account": self.db.account_payload(request["account_id"]),
                        "device": self.db.device_payload(device)}, 200

        if method == "POST" and path == "/api/auth/logout":
            auth = self._auth(headers)
            self.db.logout(auth["token_hash"])
            return {"status": "ok"}, 200

        if method == "GET" and path == "/api/account":
            auth = self._auth(headers)
            return {"account": self.db.account_payload(auth["account_id"]), "devices": self.db.list_devices(auth["account_id"])}, 200

        if method == "PATCH" and path == "/api/account/profile":
            auth = self._auth(headers)
            name = body.get("name", "")
            if not isinstance(name, str) or len(name.strip()) > 64:
                raise ApiError(400, "invalid_profile_name")
            self.db.set_display_name(auth["account_id"], name.strip())
            return {"status": "ok", "name": name.strip()}, 200

        if path.startswith("/api/account/devices/"):
            path = path.replace("/api/account/devices/", "/api/devices/", 1)
        if path.startswith("/api/devices/"):
            auth = self._auth(headers)
            parts = path.strip("/").split("/")
            device_id = urllib.parse.unquote(parts[2]) if len(parts) >= 3 else ""
            if method == "POST" and len(parts) == 4 and parts[3] == "approve":
                self.db.approve_device(auth["account_id"], device_id)
                return {"status": "ok"}, 200
            if method == "PATCH" and len(parts) == 3:
                name = body.get("name", "")
                if not isinstance(name, str) or not name.strip() or len(name.strip()) > 64:
                    raise ApiError(400, "invalid_device_name")
                self.db.rename_device(auth["account_id"], device_id, name.strip())
                return {"status": "ok"}, 200
            if method == "DELETE" and len(parts) == 3:
                if query.get("purge") == "1":
                    if device_id == auth["device_id"]:
                        raise ApiError(409, "self_forget_not_allowed")
                    self.db.forget_device(auth["account_id"], device_id)
                else:
                    self.db.revoke_device(auth["account_id"], device_id)
                return {"status": "ok"}, 200

        return _NEXT
