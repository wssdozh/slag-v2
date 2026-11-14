"""Хранилища, гранты, pairing по PIN и обмен бандлами в комнате.

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


class VaultRoutes:
    async def _route_vaults(self, method: str, path: str, query: dict, body: dict,
                     headers: dict, writer):
        if method == "GET" and path == "/api/vaults":
            auth = self._auth(headers)
            return self.db.list_vaults(auth["account_id"], auth["device_id"]), 200

        if path.startswith("/api/vaults/"):
            auth = self._auth(headers)
            parts = path.strip("/").split("/")
            vault_id = urllib.parse.unquote(parts[2]) if len(parts) >= 3 else ""
            if method == "PUT" and len(parts) == 3:
                name = body.get("name", "")
                if not isinstance(name, str) or not name.strip():
                    raise ApiError(400, "invalid_vault_name")
                return self.db.upsert_owned_vault(vault_id, name.strip(), auth["account_id"], auth["device_id"]), 200
            if method == "POST" and len(parts) == 4 and parts[3] == "rotate":
                self._authorize_vault(auth, vault_id, write=True)
                with self.db.conn:
                    self.db.conn.execute("UPDATE vault_grants SET status = 'revoked', updated_at = ? WHERE vault_id = ? AND device_id != ?",
                                         (time.time(), vault_id, auth["device_id"]))
                    self.db.conn.execute("UPDATE rooms SET retired = 1 WHERE vault_id = ?", (vault_id,))
                return {"status": "ok"}, 200
            if method == "PUT" and len(parts) == 5 and parts[3] == "grants":
                self._authorize_vault(auth, vault_id, write=True)
                mode = body.get("mode")
                encrypted_key = body.get("encryptedKey")
                if mode not in ("read-write", "receive-only") or not isinstance(encrypted_key, str):
                    raise ApiError(400, "invalid_grant")
                target_device = urllib.parse.unquote(parts[4])
                if target_device == auth["device_id"]:
                    raise ApiError(409, "self_grant_not_allowed")
                self.db.set_vault_grant(vault_id, auth["account_id"], target_device, mode, encrypted_key)
                return {"status": "ok"}, 200
            if method == "POST" and len(parts) == 4 and parts[3] in ("accept", "decline"):
                return self.db.respond_to_grant(vault_id, auth["device_id"], parts[3] == "accept"), 200
            if method == "DELETE" and len(parts) == 5 and parts[3] == "grants":
                self._authorize_vault(auth, vault_id, write=True)
                self.db.revoke_vault_grant(vault_id, auth["account_id"], urllib.parse.unquote(parts[4]))
                return {"status": "ok"}, 200

        if method == "POST" and path == "/api/pair/create":
            if not self._allow_request(f"pair-create:{self._client_ip(writer, headers)}", settings.RATE_LIMIT_PAIR_CREATE):
                return {"error": "too_many_requests"}, 429
            auth = self._auth(headers) if self.require_account_auth or self._bearer(headers) else None
            host_device = auth["device_id"] if auth else body.get("deviceId", "anonymous")
            if not isinstance(host_device, str) or not host_device:
                raise ApiError(400, "invalid_device_id")
            if auth and body.get("deviceId") not in (None, host_device):
                raise ApiError(403, "device_mismatch")
            public_key = body.get("publicKey", "")
            client_nonce = body.get("clientNonce", secrets.token_hex(16))
            if not isinstance(public_key, str) or not isinstance(client_nonce, str):
                raise ApiError(400, "invalid_pairing_key")
            return self.db.create_pairing_session(host_device, public_key,
                                                  client_nonce,
                                                  auth["account_id"] if auth else None,
                                                  auth["token_hash"] if auth else None), 200

        if method == "POST" and path == "/api/pair/claim":
            pin = body.get("pin", "")
            if not isinstance(pin, str):
                raise ApiError(400, "invalid_pin")
            client_ip = self._client_ip(writer, headers)
            now = time.time()
            attempts = [t for t in self.failed_claim_attempts.get(client_ip, []) if now - t < 300]
            if attempts:
                self.failed_claim_attempts[client_ip] = attempts
            else:
                self.failed_claim_attempts.pop(client_ip, None)
            if len(attempts) >= 5:
                return {"error": "too_many_attempts_retry_later"}, 429
            auth = self._auth(headers) if self.require_account_auth or self._bearer(headers) else None
            guest_device = auth["device_id"] if auth else None
            if auth and body.get("deviceId") != guest_device:
                raise ApiError(403, "device_mismatch")
            result = self.db.claim_pairing_session(body.get("pin", ""), body.get("publicKey", secrets.token_hex(16)),
                                                   guest_device, auth["account_id"] if auth else None)
            if result:
                self.failed_claim_attempts.pop(client_ip, None)
                logger.info("Pairing claim: session [%s] from [%s]", result["sessionId"][:8], client_ip)
                return result, 200
            attempts.append(now)
            self.failed_claim_attempts[client_ip] = attempts
            return {"error": "invalid_or_expired_pin"}, 404

        if method == "POST" and path == "/api/pair/approve":
            session_id = body.get("sessionId", "")
            if not isinstance(session_id, str) or not session_id:
                raise ApiError(400, "invalid_session")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                auth = self._auth(headers)
                pair = self._pair_participant(session_id, auth, host_only=True)
                mode = body.get("mode")
                encrypted_key = body.get("encryptedKey")
                vault_name = body.get("vaultName", "")
                if (pair["status"] != "pending_approval" or mode not in ("read-write", "receive-only")
                        or not isinstance(encrypted_key, str) or not isinstance(vault_name, str) or not vault_name.strip()):
                    raise ApiError(400, "invalid_pairing_vault")
                vault = self.db.upsert_owned_vault(body.get("vaultId", ""), vault_name.strip(),
                                                   auth["account_id"], auth["device_id"])
                self.db.set_vault_grant(vault["id"], auth["account_id"], pair["guest_device_id"], mode, encrypted_key, "accepted")
                host = self.db.conn.execute("SELECT name, platform FROM devices WHERE id = ?", (auth["device_id"],)).fetchone()
                exchange = {"vaultId": vault["id"], "vaultName": vault["name"], "mode": mode, "encryptedKey": encrypted_key,
                            "hostDeviceId": auth["device_id"], "hostDeviceName": host["name"], "hostPlatform": host["platform"]}
                payload = base64.b64encode(json.dumps(exchange).encode("utf-8")).decode("ascii")
            else:
                payload = body.get("encryptedPayload", "")
            ok = self.db.approve_pairing_session(session_id, payload)
            logger.info("Pairing approval ok=%s", ok)
            return {"status": "approved" if ok else "failed"}, 200 if ok else 400

        if method == "POST" and path == "/api/pair/reject":
            session_id = body.get("sessionId", "")
            if not isinstance(session_id, str) or not session_id:
                raise ApiError(400, "invalid_session")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                self._pair_participant(session_id, self._auth(headers))
            ok = self.db.reject_pairing_session(session_id)
            return {"status": "rejected" if ok else "failed"}, 200 if ok else 400

        if method == "POST" and path == "/api/pair/exchange":
            session_id = body.get("sessionId", "")
            if not isinstance(session_id, str) or not session_id:
                raise ApiError(400, "invalid_session")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                raise ApiError(403, "use_pair_approve")
            ok = self.db.approve_pairing_session(session_id, body.get("encryptedPayload", ""))
            return {"status": "ok" if ok else "failed"}, 200 if ok else 400

        if method == "GET" and path == "/api/pair/poll":
            session_id = query.get("session", "")
            pair_row = self.db.get_pairing_session(session_id)
            if self.require_account_auth or (pair_row and pair_row["host_account_id"]):
                self._pair_participant(session_id, self._auth(headers))
            status = self.db.poll_pairing_session(session_id)
            if not status:
                raise ApiError(404, "session_not_found")
            return status, 200

        if path.startswith("/api/rooms/") and len(path.strip("/").split("/")) == 4:
            parts = path.strip("/").split("/")
            room_id, action = urllib.parse.unquote(parts[2]), parts[3]
            if action not in ("bundle", "bundles", "ack"):
                return {"error": "not_found", "path": path}, 404
            auth = owner_account_id = vault_id = None
            max_cache = self.db.DEFAULT_MAX_CACHE_BYTES
            room_vault = self.db.room_vault(room_id)
            if self.require_account_auth or self._bearer(headers) or room_vault:
                auth = self._auth(headers)
                vault_id = query.get("vault", "")
                owner_account_id = self._authorize_room(auth, room_id, vault_id)
                max_cache = PLANS[auth["plan"]]["cache_mb"] * 1024 * 1024

            if method == "POST" and action == "bundle":
                if auth:
                    self._authorize_vault(auth, vault_id, write=True)
                bundle = body.get("bundle", body)
                if not isinstance(bundle, dict):
                    raise ApiError(400, "invalid_bundle")
                bundle_id = bundle.get("bundleId", secrets.token_hex(12))
                from_device = bundle.get("fromDeviceId", "unknown")
                if auth and from_device != auth["device_id"]:
                    raise ApiError(403, "device_mismatch")
                seq = int(bundle.get("sequence", 0))
                timestamp = bundle.get("timestamp", str(time.time()))
                payload_str = json.dumps(bundle)
                logger.info("HTTP bundle received (%d B)", len(payload_str))
                saved = self.db.save_bundle(room_id, bundle_id, from_device, seq, timestamp, payload_str,
                                            max_cache_bytes=max_cache, account_id=owner_account_id, vault_id=vault_id)
                if not saved:
                    return {"error": "cache_limit_exceeded"}, 413
                sync_id = saved
                bundle_to_broadcast = dict(bundle)
                bundle_to_broadcast["syncId"] = sync_id
                await self._broadcast_to_room(room_id, json.dumps({"type": "bundle", "bundle": bundle_to_broadcast}), exclude_device=from_device)
                return {"status": "delivered", "bundleId": bundle_id, "syncId": sync_id}, 200

            if method == "GET" and action == "bundles":
                device_id = query.get("device", "")
                if auth:
                    if device_id and device_id != auth["device_id"]:
                        raise ApiError(403, "device_mismatch")
                    device_id = auth["device_id"]
                limit = max(1, min(1000, int(query.get("limit", 100))))
                since_sync_id = 0
                try:
                    since_sync_id = int(query.get("since", "0"))
                except (ValueError, TypeError):
                    since_sync_id = 0
                bundles = self.db.get_pending_bundles(room_id, device_id, limit, since_sync_id=since_sync_id)
                return {"bundles": bundles, **self.db.get_room_watermarks(room_id)}, 200

            if method == "POST" and action == "ack":
                device_id = body.get("deviceId", "")
                if auth:
                    if device_id and device_id != auth["device_id"]:
                        raise ApiError(403, "device_mismatch")
                    device_id = auth["device_id"]
                bundle_ids = body.get("bundleIds", [])
                if not isinstance(bundle_ids, list):
                    raise ApiError(400, "invalid_bundle_ids")
                return {"status": "ok", "acked": self.db.record_acks(device_id, bundle_ids, room_id)}, 200

        return _NEXT
