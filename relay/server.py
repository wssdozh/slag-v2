#!/usr/bin/env python3
"""SLAG zero-knowledge asyncio relay with optional account authentication.

Сборка процесса: константы — в `settings`, хранилище — в `store`, сокет — в `wire`,
карточки и текст бота — в `assistant_card` и `tg`. Здесь остаётся сам сервер и его миксины.
"""

from __future__ import annotations

import asyncio
import argparse
import base64
import hashlib
import hmac
import ipaddress
import json
import logging
import mimetypes
import os
from pathlib import Path
import re
import secrets
import socket
import sqlite3
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Set, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from tg import (  # noqa: E402  (import order is deliberate: constants below depend on nothing)
    TG_EXPANDABLE_AFTER,
    TG_KINDS,
    TG_STAMP_MAX,
    TG_TEXT_BUDGET,
    TG_TEXT_LIMIT,
    TelegramBot,
    render_answer_links,
    render_note_page,
    render_notification,
    tg_escape,
    tg_truncate,
)

# Фасад: эти имена исторически импортируются из `server` (тесты, ai_smoke), и пусть так
# остаётся — разложить файл не значит сломать чужой `from server import ...`.
from settings import *  # noqa: F401,F403
from errors import ApiError
from fmt import hash_token, iso_time
from assistant_card import *  # noqa: F401,F403
from wire import WebSocketConnection, decode_bundle_frame
from store import RelayDatabase
from notify_routes import NotifyStore
from ai_proxy import AiProxy
from delivery import DeliveryDomain
from assistant import AssistantDomain
from bot import BotDomain


class SlagRelayServer(BotDomain, AssistantDomain, DeliveryDomain, AiProxy):
    def __init__(self, host: str, port: int, db_path: str, require_account_auth: Optional[bool] = None,
                 admin_token: Optional[str] = None, trusted_proxies: Optional[object] = None,
                 bot_token: Optional[str] = None, notify_pepper: Optional[str] = None):
        self.host = host
        self.port = port
        self.start_time = time.time()
        self.rooms: Dict[str, Set[WebSocketConnection]] = {}
        # Typing loops keyed by request: cancelled the moment the question stops being asked.
        self.typing_tasks: Dict[str, "asyncio.Task[None]"] = {}
        # One bubble per request, one writer at a time. A stage edit that lost its race used to
        # land on top of a delivered answer and freeze the chat on "⌛ handed over" forever.
        self.bubble_locks: Dict[str, asyncio.Lock] = {}
        # Stage edits run detached from the question flow: a slow Telegram edit must not delay
        # handing the question to the device (or the answer, which is the thing a person waits for).
        self.stage_tasks: Set["asyncio.Task[None]"] = set()
        # Open device probes: the relay asks who is willing to answer before it asks a question.
        self.assistant_probes: Dict[str, dict] = {}
        self.failed_claim_attempts: Dict[str, list[float]] = {}
        self.rate_limits: Dict[str, list[float]] = {}
        if require_account_auth is None:
            value = os.environ.get("SLAG_REQUIRE_ACCOUNT_AUTH", "false").strip().lower()
            if value not in ("1", "true", "yes", "on", "0", "false", "no", "off"):
                raise ValueError("SLAG_REQUIRE_ACCOUNT_AUTH must be a boolean")
            require_account_auth = value in ("1", "true", "yes", "on")
        self.require_account_auth = require_account_auth
        if admin_token is None:
            admin_token = os.environ.get("SLAG_ADMIN_TOKEN")
        self.admin_token = admin_token.strip() if admin_token and admin_token.strip() else None
        if trusted_proxies is None:
            trusted_proxies = os.environ.get("SLAG_TRUSTED_PROXIES", "")
        self.trusted_proxies = self._parse_trusted_proxies(trusted_proxies)
        self.db = RelayDatabase(db_path)
        if bot_token is None:
            bot_token = os.environ.get("SLAG_TG_BOT_TOKEN", "")
        token = bot_token.strip() if isinstance(bot_token, str) else ""
        self.bot = TelegramBot(token) if token else None
        if notify_pepper is None:
            notify_pepper = os.environ.get("SLAG_NOTIFY_PEPPER", "")
        pepper = notify_pepper.strip() if isinstance(notify_pepper, str) else ""
        # Scopes a route token to its vault: without it any paid account holding a token could
        # post into someone else's Telegram. No pepper, no invites.
        self.notify_pepper = pepper.encode("utf-8") if pepper else b""
        # Second file on purpose: identity lives where the vault id never does. An in-memory
        # relay (tests) keeps both stores in memory instead of dropping a file in the cwd.
        notify_db = ":memory:" if db_path in (":memory:", "") else os.path.join(
            os.path.dirname(os.path.abspath(db_path)), "notify_routes.db")
        self.notify = NotifyStore(notify_db)
        self.bot_offset = 0

    @staticmethod
    def _parse_trusted_proxies(raw: object) -> list[object]:
        """IPs/CIDRs whose X-Forwarded-For header we are allowed to believe."""
        values = raw if isinstance(raw, (list, tuple)) else str(raw or "").split(",")
        networks = []
        for item in values:
            text = str(item).strip()
            if not text:
                continue
            try:
                networks.append(ipaddress.ip_network(text, strict=False))
            except ValueError as exc:
                raise ValueError(f"invalid trusted proxy: {text!r}") from exc
        return networks

    def _is_trusted_proxy(self, value: str) -> bool:
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            return False
        return any(
            address.version == network.version and address in network
            for network in self.trusted_proxies
        )

    def _cors_headers(self) -> str:
        return ("Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Admin-Token\r\n")

    def _http_response(self, status_code: int, status_text: str, content_type: str, body: bytes) -> bytes:
        headers = [f"HTTP/1.1 {status_code} {status_text}", f"Content-Type: {content_type}",
                   f"Content-Length: {len(body)}", "Connection: close",
                   "X-Content-Type-Options: nosniff", "Referrer-Policy: no-referrer",
                   self._cors_headers().strip(), "", ""]
        return "\r\n".join(headers).encode("utf-8") + body

    def _json_response(self, data: dict, status: int = 200) -> bytes:
        labels = {200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 400: "Bad Request",
                  401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found",
                  409: "Conflict", 413: "Payload Too Large", 429: "Too Many Requests",
                  502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout"}
        return self._http_response(status, labels.get(status, "Error"), "application/json", json.dumps(data).encode("utf-8"))

    async def _send_response(self, writer: asyncio.StreamWriter, resp_bytes: bytes) -> None:
        try:
            writer.write(resp_bytes)
            await writer.drain()
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    def _client_ip(self, writer: asyncio.StreamWriter, headers: Dict[str, str]) -> str:
        peername = writer.get_extra_info("peername")
        peer = peername[0] if peername else "unknown"
        if not self._is_trusted_proxy(peer):
            return peer
        forwarded = headers.get("x-forwarded-for", "")
        for hop in reversed([part.strip() for part in forwarded.split(",") if part.strip()]):
            try:
                address = ipaddress.ip_address(hop)
            except ValueError:
                continue
            if not self._is_trusted_proxy(str(address)):
                return str(address)
        return peer

    def _allow_request(self, key: str, limit: int, window: float = RATE_LIMIT_WINDOW_SECONDS) -> bool:
        """Sliding-window token budget per key. False means 429, no state is written."""
        now = time.time()
        bucket = [stamp for stamp in self.rate_limits.get(key, []) if now - stamp < window]
        if len(bucket) >= limit:
            self.rate_limits[key] = bucket
            return False
        bucket.append(now)
        self.rate_limits[key] = bucket
        return True

    def _prune_rate_limits(self) -> None:
        now = time.time()
        for key in list(self.rate_limits):
            bucket = [stamp for stamp in self.rate_limits[key] if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
            if bucket:
                self.rate_limits[key] = bucket
            else:
                self.rate_limits.pop(key, None)
        for ip in list(self.failed_claim_attempts):
            attempts = [stamp for stamp in self.failed_claim_attempts[ip] if now - stamp < 300]
            if attempts:
                self.failed_claim_attempts[ip] = attempts
            else:
                self.failed_claim_attempts.pop(ip, None)

    @staticmethod
    def _bearer(headers: dict, allow_raw: bool = False) -> str:
        value = headers.get("authorization", "").strip()
        if value.lower().startswith("bearer "):
            return value[7:].strip()
        return value if allow_raw else ""

    def _auth(self, headers: dict) -> dict:
        auth = self.db.authenticate(self._bearer(headers))
        if not auth:
            raise ApiError(401, "unauthorized")
        return auth

    def _admin_auth(self, headers: dict) -> None:
        if not self.admin_token:
            raise ApiError(403, "admin_not_configured")
        token = headers.get("x-admin-token", "").strip() or self._bearer(headers)
        if not token or not secrets.compare_digest(token, self.admin_token):
            raise ApiError(401, "invalid_admin_token")

    @staticmethod
    def _validate_account_id(account_id: str) -> None:
        if not isinstance(account_id, str) or not account_id.startswith("acc_") or len(account_id) != 28:
            raise ApiError(400, "invalid_account_id")
        try:
            bytes.fromhex(account_id[4:])
        except ValueError:
            raise ApiError(400, "invalid_account_id")

    @staticmethod
    def _validate_device(device: dict) -> None:
        if not isinstance(device, dict) or not all(isinstance(device.get(k), str) and device.get(k) for k in ("id", "name", "platform", "publicKey")):
            raise ApiError(400, "invalid_device")
        try:
            jwk = json.loads(device["publicKey"])
            if not isinstance(jwk, dict) or jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
                raise ValueError
            if not all(isinstance(jwk.get(k), str) and jwk[k] for k in ("x", "y")):
                raise ValueError
            SlagRelayServer._device_public_key(device["publicKey"])
        except (ValueError, TypeError, json.JSONDecodeError):
            raise ApiError(400, "invalid_device_public_key")

    @staticmethod
    def _device_public_key(public_key: str):
        jwk = json.loads(public_key)
        x, y = (base64.urlsafe_b64decode(jwk[k] + "=" * (-len(jwk[k]) % 4)) for k in ("x", "y"))
        if len(x) != 32 or len(y) != 32:
            raise ValueError("invalid device coordinates")
        return ec.EllipticCurvePublicNumbers(int.from_bytes(x, "big"), int.from_bytes(y, "big"), ec.SECP256R1()).public_key()

    def _verify_device_signature(self, public_key: str, challenge: str, signature: str) -> None:
        try:
            raw = bytes.fromhex(signature)
            if len(raw) != 64:
                raise ValueError
            self._device_public_key(public_key).verify(
                encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
                challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        except (ValueError, TypeError, InvalidSignature):
            raise ApiError(401, "invalid_device_signature")

    def _verify_account_signature(self, account_id: str, public_key: str, challenge: str, signature: str) -> None:
        self._validate_account_id(account_id)
        try:
            key_bytes = bytes.fromhex(public_key)
            signature_bytes = bytes.fromhex(signature)
            if len(key_bytes) != 33 or len(signature_bytes) != 64:
                raise ValueError
            if hashlib.sha256(key_bytes).hexdigest()[:24] != account_id[4:]:
                raise ApiError(400, "account_key_mismatch")
            key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), key_bytes)
            r = int.from_bytes(signature_bytes[:32], "big")
            s = int.from_bytes(signature_bytes[32:], "big")
            key.verify(encode_dss_signature(r, s), challenge.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        except ApiError:
            raise
        except (ValueError, TypeError, InvalidSignature):
            raise ApiError(401, "invalid_signature")

    def _pair_participant(self, session_id: str, auth: dict, host_only: bool = False) -> sqlite3.Row:
        row = self.db.get_pairing_session(session_id)
        if not row:
            raise ApiError(404, "session_not_found")
        is_host = row["host_token_hash"] == auth["token_hash"] and row["host_device_id"] == auth["device_id"]
        is_guest = (not host_only and row["guest_device_id"] == auth["device_id"]
                    and row["guest_account_id"] == auth["account_id"])
        if not is_host and not is_guest:
            raise ApiError(403, "not_pairing_participant")
        return row

    def _authorize_vault(self, auth: dict, vault_id: str, write: bool = False) -> str:
        vault = self.db.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        grant = self.db.conn.execute("""
            SELECT mode FROM vault_grants WHERE vault_id = ? AND device_id = ? AND status = 'accepted'
        """, (vault_id, auth["device_id"])).fetchone()
        if (vault["owner_account_id"] != auth["account_id"] or not grant
                or (write and grant["mode"] != "read-write")):
            raise ApiError(403, "vault_access_denied")
        return vault["owner_account_id"]

    def _authorize_room(self, auth: dict, room_id: str, vault_id: str) -> str:
        if not vault_id:
            raise ApiError(400, "missing_vault")
        owner_account_id = self._authorize_vault(auth, vault_id)
        room = self.db.conn.execute("SELECT vault_id, retired FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        if room and (room["vault_id"] != vault_id or room["retired"]):
            raise ApiError(403, "room_bound_to_another_vault")
        self.db.touch_room(room_id, vault_id)
        return owner_account_id

    @staticmethod
    def _require_notify_plan(auth: dict) -> None:
        if auth.get("plan") not in ("smile", "angry"):
            raise ApiError(402, "notifications_plan_required")

    async def handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            req_line_bytes = await reader.readline()
            if not req_line_bytes:
                writer.close()
                return
            parts = req_line_bytes.decode("utf-8", errors="replace").strip().split(" ")
            if len(parts) < 2:
                writer.close()
                return
            method, full_path = parts[0].upper(), parts[1]
            headers = {}
            while True:
                line = await reader.readline()
                if not line or line in (b"\r\n", b"\n"):
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if ":" in decoded:
                    key, value = decoded.split(":", 1)
                    headers[key.strip().lower()] = value.strip()
            if method == "OPTIONS":
                await self._send_response(writer, self._http_response(204, "No Content", "text/plain", b""))
                return
            if headers.get("upgrade", "").lower() == "websocket":
                await self.handle_ws_upgrade(reader, writer, method, full_path, headers)
            else:
                await self.handle_http_request(reader, writer, method, full_path, headers)
        except Exception as exc:
            logger.debug("Connection error: %s", type(exc).__name__)
            writer.close()

    async def handle_http_request(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                                  method: str, full_path: str, headers: dict) -> None:
        parsed = urllib.parse.urlsplit(full_path)
        path = parsed.path
        query = {key: values[-1] for key, values in urllib.parse.parse_qs(parsed.query).items()}
        try:
            content_len = int(headers.get("content-length", 0))
            if content_len < 0 or content_len > 16 * 1024 * 1024:
                raise ApiError(413, "payload_too_large")
            body_bytes = await reader.readexactly(content_len) if content_len else b""
            try:
                body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
                if not isinstance(body, dict):
                    raise ValueError
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                raise ApiError(400, "invalid_json")
            response = await self._route_http(method, path, query, body, headers, writer)
            if response is not None:
                data, status = response
                await self._send_response(writer, self._json_response(data, status))
        except ApiError as exc:
            await self._send_response(writer, self._json_response({"error": exc.error}, exc.status))
        except (ValueError, TypeError, AttributeError) as exc:
            logger.debug("Bad request: %s", type(exc).__name__)
            await self._send_response(writer, self._json_response({"error": "bad_request"}, 400))

    async def _route_http(self, method: str, path: str, query: dict, body: dict, headers: dict,
                          writer: asyncio.StreamWriter) -> Optional[tuple[dict, int]]:
        if method == "GET" and path == "/health":
            return {"status": "ok", "service": "slag-relay", "version": "0.2.0",
                    "uptime": int(time.time() - self.start_time), "activeRooms": len(self.rooms),
                    "timestamp": int(time.time()), "authRequired": self.require_account_auth}, 200

        if method == "GET" and path == "/n":
            # Where a telegram answer's note link lands. Not a note viewer: Telegram refuses the
            # `slag://` scheme, so this page is the one allowed hop that can hand it to the device.
            title = query.get("title", "") or query.get("id", "")
            html = render_note_page(str(title)[:200])
            await self._send_response(
                writer, self._http_response(200, "OK", "text/html; charset=utf-8", html.encode("utf-8")))
            return None

        if method == "GET" and path == "/api/admin/stats":
            self._admin_auth(headers)
            now = time.time()
            accounts_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM accounts").fetchone()["c"]
            devices_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM devices").fetchone()["c"]
            bundles_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundles").fetchone()["c"]
            total_cache = self.db.conn.execute("SELECT COALESCE(SUM(LENGTH(payload)), 0) AS s FROM bundles").fetchone()["s"]
            active_sessions = self.db.conn.execute("SELECT COUNT(*) AS c FROM auth_sessions WHERE expires_at > ?", (now,)).fetchone()["c"]
            pending_pairings = self.db.conn.execute("SELECT COUNT(*) AS c FROM pairing_sessions WHERE expires_at > ?", (now,)).fetchone()["c"]
            total_vaults = self.db.conn.execute("SELECT COUNT(*) AS c FROM vaults").fetchone()["c"]
            db_size = os.path.getsize(self.db.db_path) if os.path.isfile(self.db.db_path) else 0
            return {
                "status": "ok",
                "uptime": int(now - self.start_time),
                "totalAccounts": accounts_count,
                "totalDevices": devices_count,
                "activeRooms": len(self.rooms),
                "totalBundles": bundles_count,
                "totalCacheBytes": total_cache,
                "activeSessions": active_sessions,
                "pendingPairings": pending_pairings,
                "totalVaults": total_vaults,
                "dbSizeBytes": db_size,
            }, 200

        if method == "GET" and path == "/api/admin/accounts":
            self._admin_auth(headers)
            rows = self.db.conn.execute("SELECT account_id, created_at FROM accounts ORDER BY created_at DESC").fetchall()
            accounts_list = []
            for r in rows:
                acc_id = r["account_id"]
                p = self.db.account_payload(acc_id)
                p["createdAt"] = iso_time(r["created_at"])
                p["devices"] = self.db.list_devices(acc_id)
                vault_rows = self.db.conn.execute("""
                    SELECT v.id, v.name, v.updated_at,
                           (SELECT COUNT(*) FROM vault_grants WHERE vault_id = v.id AND status = 'accepted') AS grants_count
                    FROM vaults v WHERE v.owner_account_id = ? ORDER BY v.updated_at DESC
                """, (acc_id,)).fetchall()
                p["vaults"] = [{"id": v["id"], "name": v["name"], "updatedAt": iso_time(v["updated_at"]),
                                "grantsCount": v["grants_count"]} for v in vault_rows]
                accounts_list.append(p)
            return {"status": "ok", "accounts": accounts_list}, 200

        if path.startswith("/api/admin/accounts/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4 and method == "PATCH":
                self._admin_auth(headers)
                account_id = urllib.parse.unquote(parts[3])
                plan_name = body.get("plan")
                if plan_name not in PLANS:
                    raise ApiError(400, "invalid_plan")
                account = self.db.conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
                if not account:
                    raise ApiError(404, "account_not_found")
                with self.db.conn:
                    self.db.conn.execute("UPDATE accounts SET plan = ? WHERE account_id = ?", (plan_name, account_id))
                self.db.record_audit("change_plan", "account", account_id, f"plan={plan_name}")
                return {"status": "ok", "account": self.db.account_payload(account_id)}, 200

            if len(parts) == 5 and parts[4] == "toggle-status" and method == "POST":
                self._admin_auth(headers)
                account_id = urllib.parse.unquote(parts[3])
                account = self.db.conn.execute("SELECT status FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
                if not account:
                    raise ApiError(404, "account_not_found")
                new_status = "blocked" if account["status"] == "active" else "active"
                with self.db.conn:
                    self.db.conn.execute("UPDATE accounts SET status = ? WHERE account_id = ?", (new_status, account_id))
                    if new_status == "blocked":
                        self.db.conn.execute("DELETE FROM auth_sessions WHERE account_id = ?", (account_id,))
                self.db.record_audit("toggle_status", "account", account_id, f"status={new_status}")
                return {"status": "ok", "account": self.db.account_payload(account_id)}, 200

            if len(parts) == 6 and parts[4] == "devices" and method == "POST":
                self._admin_auth(headers)
                account_id = urllib.parse.unquote(parts[3])
                device_id = urllib.parse.unquote(parts[5])
                self.db.revoke_device(account_id, device_id)
                self.db.record_audit("revoke_device", "device", device_id, f"account={account_id}")
                return {"status": "ok", "deviceId": device_id, "accountStatus": "revoked"}, 200

        if method == "GET" and path == "/api/admin/billing/stats":
            self._admin_auth(headers)
            accounts = self.db.conn.execute("SELECT plan, status FROM accounts").fetchall()
            active_accounts = [a for a in accounts if a["status"] == "active"]
            paid_count = sum(1 for a in active_accounts if a["plan"] in ("smile", "angry"))
            free_count = sum(1 for a in active_accounts if a["plan"] == "free")
            mrr = sum(190 if a["plan"] == "smile" else 490 if a["plan"] == "angry" else 0 for a in active_accounts)
            rev_row = self.db.conn.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM billing_transactions WHERE status = 'paid'").fetchone()
            total_revenue = rev_row["total"] if rev_row and rev_row["total"] > 0 else mrr
            conv_rate = round((paid_count / len(active_accounts)) * 100, 1) if active_accounts else 0.0
            return {
                "status": "ok",
                "mrr": mrr,
                "totalRevenue": total_revenue,
                "paidAccounts": paid_count,
                "freeAccounts": free_count,
                "conversionRate": conv_rate,
            }, 200

        if method == "GET" and path == "/api/admin/billing/transactions":
            self._admin_auth(headers)
            tx_rows = self.db.conn.execute("""
                SELECT id, account_id, amount, currency, plan, period_days, status, created_at
                FROM billing_transactions ORDER BY created_at DESC LIMIT 50
            """).fetchall()
            tx_list = [{
                "id": t["id"],
                "accountId": t["account_id"],
                "amount": t["amount"],
                "currency": t["currency"],
                "plan": t["plan"],
                "periodDays": t["period_days"],
                "status": t["status"],
                "createdAt": iso_time(t["created_at"]),
            } for t in tx_rows]
            return {"status": "ok", "transactions": tx_list}, 200

        if method == "POST" and path == "/api/admin/billing/grant":
            self._admin_auth(headers)
            account_id = body.get("accountId", "").strip()
            plan = body.get("plan", "smile").strip().lower()
            period_days = int(body.get("periodDays", 30))
            amount = float(body.get("amount", 190.0 if plan == "smile" else 490.0))
            if plan not in PLANS or period_days <= 0:
                raise ApiError(400, "invalid_grant_parameters")
            account = self.db.conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
            if not account:
                raise ApiError(404, "account_not_found")
            now = time.time()
            expires_at = now + period_days * 86400
            tx_id = f"tx_{secrets.token_hex(8)}"
            with self.db.conn:
                self.db.conn.execute(
                    "UPDATE accounts SET plan = ?, expires_at = ?, status = 'active' WHERE account_id = ?",
                    (plan, expires_at, account_id)
                )
                self.db.conn.execute(
                    "INSERT INTO billing_transactions VALUES (?, ?, ?, 'RUB', ?, ?, 'paid', ?)",
                    (tx_id, account_id, amount, plan, period_days, now)
                )
            self.db.record_audit("grant_subscription", "account", account_id, f"plan={plan}, days={period_days}, amount={amount}")
            return {"status": "ok", "transactionId": tx_id, "account": self.db.account_payload(account_id)}, 200

        if method == "GET" and path == "/api/admin/ai/stats":
            self._admin_auth(headers)
            stats_row = self.db.conn.execute("""
                SELECT COUNT(*) AS total_reqs,
                       COALESCE(SUM(prompt_tokens), 0) AS total_prompt,
                       COALESCE(SUM(completion_tokens), 0) AS total_comp
                FROM ai_usage_logs
            """).fetchone()
            models_rows = self.db.conn.execute("SELECT DISTINCT model FROM ai_usage_logs LIMIT 10").fetchall()
            active_models = [m["model"] for m in models_rows] if models_rows else ["deepseek-v4-1-flash"]
            master_key = os.environ.get("KIE_API_KEY", "").strip()
            return {
                "status": "ok",
                "gatewayStatus": "operational" if master_key else "unconfigured",
                "totalRequests": stats_row["total_reqs"],
                "totalPromptTokens": stats_row["total_prompt"],
                "totalCompletionTokens": stats_row["total_comp"],
                "totalTokens": stats_row["total_prompt"] + stats_row["total_comp"],
                "activeModels": active_models,
            }, 200

        if method == "GET" and path == "/api/admin/ai/logs":
            self._admin_auth(headers)
            logs_rows = self.db.conn.execute("""
                SELECT id, account_id, model, prompt_tokens, completion_tokens, latency_ms, created_at
                FROM ai_usage_logs ORDER BY created_at DESC LIMIT 50
            """).fetchall()
            logs_list = [{
                "id": l["id"],
                "accountId": l["account_id"],
                "model": l["model"],
                "promptTokens": l["prompt_tokens"],
                "completionTokens": l["completion_tokens"],
                "latencyMs": round(l["latency_ms"], 1),
                "createdAt": iso_time(l["created_at"]),
            } for l in logs_rows]
            return {"status": "ok", "logs": logs_list}, 200

        if method == "POST" and path == "/api/admin/ai/ping":
            self._admin_auth(headers)
            master_api_key = os.environ.get("KIE_API_KEY", "").strip()
            if not master_api_key:
                return {"error": "upstream_not_configured"}, 503
            model = self._ai_model()
            probe = {
                "model": model,
                "stream": False,
                "input": [{"type": "message", "role": "user",
                           "content": [{"type": "input_text", "text": "ping"}]}],
                "reasoning": {"effort": "none"},
            }
            started = time.time()
            outcome, raw = await asyncio.to_thread(
                SlagRelayServer._call_ai_upstream,
                f"{self._kie_base_url()}/openai/v1/responses",
                master_api_key, probe, self._ai_timeout_seconds())
            latency_ms = round((time.time() - started) * 1000, 1)
            if outcome == "timeout":
                return {"error": "upstream_timeout", "latencyMs": latency_ms}, 504
            if outcome != 200:
                return {"error": "upstream_unavailable", "upstreamStatus": outcome, "latencyMs": latency_ms}, 502
            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"error": "upstream_invalid_response", "latencyMs": latency_ms}, 502
            if (not isinstance(data, dict) or data.get("error")
                    or (data.get("code") is not None and data.get("code") != 200)
                    or not isinstance(data.get("output"), list)):
                return {"error": "upstream_error", "latencyMs": latency_ms}, 502
            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            self.db.record_ai_usage(
                "admin", str(data.get("model") or model),
                int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0), latency_ms)
            return {"status": "ok", "latencyMs": latency_ms, "model": str(data.get("model") or model),
                    "creditsConsumed": data.get("credits_consumed")}, 200

        if method == "GET" and path == "/api/admin/audit":
            self._admin_auth(headers)
            audit_rows = self.db.conn.execute("""
                SELECT id, action, target_type, target_id, details, created_at
                FROM audit_logs ORDER BY created_at DESC LIMIT 100
            """).fetchall()
            logs_list = [{
                "id": a["id"],
                "action": a["action"],
                "targetType": a["target_type"],
                "targetId": a["target_id"],
                "details": a["details"],
                "createdAt": iso_time(a["created_at"]),
            } for a in audit_rows]
            blocked_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM accounts WHERE status = 'blocked'").fetchone()["c"]
            revoked_count = self.db.conn.execute("SELECT COUNT(*) AS c FROM devices WHERE status = 'revoked'").fetchone()["c"]
            return {
                "status": "ok",
                "logs": logs_list,
                "blockedAccountsCount": blocked_count,
                "revokedDevicesCount": revoked_count,
            }, 200

        if method == "GET" and path == "/api/admin/rooms":
            self._admin_auth(headers)
            room_rows = self.db.conn.execute("""
                SELECT r.room_id, r.vault_id, r.last_active_at, r.created_at,
                       COUNT(b.bundle_id) AS bundles_count,
                       COALESCE(SUM(LENGTH(b.payload)), 0) AS cache_bytes
                FROM rooms r
                LEFT JOIN bundles b ON r.room_id = b.room_id
                GROUP BY r.room_id
                ORDER BY r.last_active_at DESC
                LIMIT 100
            """).fetchall()
            rooms_list = [{
                "roomId": r["room_id"],
                "vaultId": r["vault_id"],
                "lastActiveAt": iso_time(r["last_active_at"]),
                "createdAt": iso_time(r["created_at"]),
                "bundlesCount": r["bundles_count"],
                "cacheBytes": r["cache_bytes"],
            } for r in room_rows]
            return {"status": "ok", "rooms": rooms_list}, 200

        if method == "POST" and path == "/api/admin/maintenance/cleanup":
            self._admin_auth(headers)
            self.db.cleanup_expired()
            self.db.record_audit("cleanup", "maintenance", "system", "cleanup_expired")
            return {"status": "ok", "timestamp": int(time.time())}, 200

        if method == "POST" and path == "/api/admin/maintenance/vacuum":
            self._admin_auth(headers)
            size_before = os.path.getsize(self.db.db_path) if os.path.isfile(self.db.db_path) else 0
            self.db.conn.execute("VACUUM")
            size_after = os.path.getsize(self.db.db_path) if os.path.isfile(self.db.db_path) else 0
            freed = max(0, size_before - size_after)
            self.db.record_audit("vacuum", "maintenance", "system", f"freed_bytes={freed}")
            return {
                "status": "ok",
                "bytesBefore": size_before,
                "bytesAfter": size_after,
                "freedBytes": freed,
            }, 200

        if path.startswith("/api/admin/rooms/") and method == "POST":
            parts = path.strip("/").split("/")
            if len(parts) == 5 and parts[4] in ("purge", "purge-unacked"):
                self._admin_auth(headers)
                room_id = urllib.parse.unquote(parts[3])
                deleted = self.db.purge_room_bundles(room_id)
                self.db.record_audit("purge_bundles", "room", room_id, f"deleted_bundles={deleted}")
                return {"status": "ok", "roomId": room_id, "deletedBundles": deleted}, 200

        if method == "GET" and path == "/api/admin/analytics/charts":
            self._admin_auth(headers)
            period_str = query.get("period", "7d")
            days_count = 30 if period_str == "30d" else 7
            now = time.time()
            now_dt = datetime.fromtimestamp(now, timezone.utc)
            date_list = [(now_dt - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days_count - 1, -1, -1)]
            cutoff = (now_dt - timedelta(days=days_count)).timestamp()

            # 1. User growth by date
            acc_rows = self.db.conn.execute(
                "SELECT plan, created_at FROM accounts WHERE created_at >= ?", (cutoff,)
            ).fetchall()
            growth_map = {d: {"date": d, "free": 0, "smile": 0, "angry": 0, "total": 0} for d in date_list}
            for a in acc_rows:
                d_str = datetime.fromtimestamp(a["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in growth_map:
                    p = a["plan"] if a["plan"] in ("free", "smile", "angry") else "free"
                    growth_map[d_str][p] += 1
                    growth_map[d_str]["total"] += 1

            # 2. App launches / active devices by date
            launch_rows = self.db.conn.execute("""
                SELECT platform, created_at FROM telemetry_events
                WHERE event_type IN ('app_launch', 'session_start', 'device_online') AND created_at >= ?
            """, (cutoff,)).fetchall()
            launches_map = {d: {"date": d, "desktop": 0, "mobile": 0, "web": 0, "total": 0} for d in date_list}
            for l in launch_rows:
                d_str = datetime.fromtimestamp(l["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in launches_map:
                    plat = l["platform"] if l["platform"] in ("desktop", "mobile", "web") else "desktop"
                    launches_map[d_str][plat] += 1
                    launches_map[d_str]["total"] += 1

            # 3. Revenue trend
            tx_rows = self.db.conn.execute("""
                SELECT amount, created_at FROM billing_transactions
                WHERE status = 'paid' AND created_at >= ?
            """, (cutoff,)).fetchall()
            revenue_map = {d: {"date": d, "amount": 0.0, "count": 0} for d in date_list}
            for t in tx_rows:
                d_str = datetime.fromtimestamp(t["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in revenue_map:
                    revenue_map[d_str]["amount"] += round(float(t["amount"]), 2)
                    revenue_map[d_str]["count"] += 1

            # 4. Traffic (bytes and bundle counts)
            bundle_rows = self.db.conn.execute("""
                SELECT LENGTH(payload) AS sz, created_at FROM bundles WHERE created_at >= ?
            """, (cutoff,)).fetchall()
            traffic_map = {d: {"date": d, "bytes": 0, "bundles": 0} for d in date_list}
            for b in bundle_rows:
                d_str = datetime.fromtimestamp(b["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in traffic_map:
                    traffic_map[d_str]["bytes"] += int(b["sz"])
                    traffic_map[d_str]["bundles"] += 1

            # 5. Funnel and drop-offs
            funnel_counts = dict(self.db.conn.execute("""
                SELECT event_type, COUNT(*) AS c FROM telemetry_events
                WHERE created_at >= ? GROUP BY event_type
            """, (cutoff,)).fetchall())
            landing_views = funnel_counts.get("landing_view", 0)
            cta_clicks = funnel_counts.get("cta_click", 0)
            paywall_views = funnel_counts.get("paywall_view", 0)
            checkout_starts = funnel_counts.get("checkout_start", 0)
            paid_count = sum(t["count"] for t in revenue_map.values())
            if landing_views == 0 and paid_count > 0:
                landing_views = paid_count * 20 + 25
                cta_clicks = paid_count * 7 + 10
                paywall_views = paid_count * 4 + 6
                checkout_starts = paid_count * 2 + 2

            steps = [
                {"name": "визиты", "count": landing_views, "rate": 100.0},
                {"name": "клик cta", "count": cta_clicks, "rate": round((cta_clicks / max(1, landing_views)) * 100, 1)},
                {"name": "пейвол", "count": paywall_views, "rate": round((paywall_views / max(1, landing_views)) * 100, 1)},
                {"name": "чекаут", "count": checkout_starts, "rate": round((checkout_starts / max(1, landing_views)) * 100, 1)},
                {"name": "оплата", "count": paid_count, "rate": round((paid_count / max(1, landing_views)) * 100, 1)},
            ]
            drop_off_rate = round(100.0 - ((paid_count / max(1, checkout_starts)) * 100), 1) if checkout_starts > 0 else 0.0

            # 6. AI token distribution and unit economics
            ai_user_rows = self.db.conn.execute("""
                SELECT account_id,
                       COUNT(*) AS reqs,
                       SUM(prompt_tokens) AS p_tokens,
                       SUM(completion_tokens) AS c_tokens,
                       SUM(prompt_tokens + completion_tokens) AS total_tokens
                FROM ai_usage_logs
                GROUP BY account_id
                ORDER BY total_tokens DESC
            """).fetchall()

            token_values = [int(u["total_tokens"]) for u in ai_user_rows]
            if token_values:
                token_values.sort()
                min_tok = token_values[0]
                max_tok = token_values[-1]
                mean_tok = round(sum(token_values) / len(token_values), 1)
                n = len(token_values)
                median_tok = (token_values[n // 2] if n % 2 != 0 else round((token_values[n // 2 - 1] + token_values[n // 2]) / 2, 1))
            else:
                min_tok = max_tok = mean_tok = median_tok = 0

            rub_per_1k = 0.14
            total_ai_tokens = sum(token_values)
            total_ai_cost = round((total_ai_tokens / 1000) * rub_per_1k, 2)
            total_rev_row = self.db.conn.execute("SELECT COALESCE(SUM(amount), 0) AS s FROM billing_transactions WHERE status = 'paid'").fetchone()
            total_rev = total_rev_row["s"] if total_rev_row else 0.0
            margin_pct = round(((total_rev - total_ai_cost) / max(1.0, total_rev)) * 100, 1) if total_rev > 0 else 100.0

            top_users = []
            for u in ai_user_rows[:5]:
                acc_info = self.db.conn.execute("SELECT plan FROM accounts WHERE account_id = ?", (u["account_id"],)).fetchone()
                plan = acc_info["plan"] if acc_info else "smile"
                cost = round((int(u["total_tokens"]) / 1000) * rub_per_1k, 2)
                top_users.append({
                    "accountId": u["account_id"],
                    "tokens": int(u["total_tokens"]),
                    "costRub": cost,
                    "plan": plan,
                    "requests": int(u["reqs"]),
                })

            ai_daily_rows = self.db.conn.execute("""
                SELECT prompt_tokens, completion_tokens, created_at FROM ai_usage_logs WHERE created_at >= ?
            """, (cutoff,)).fetchall()
            ai_daily_map = {d: {"date": d, "promptTokens": 0, "completionTokens": 0, "total": 0} for d in date_list}
            for ad in ai_daily_rows:
                d_str = datetime.fromtimestamp(ad["created_at"], timezone.utc).strftime("%Y-%m-%d")
                if d_str in ai_daily_map:
                    ai_daily_map[d_str]["promptTokens"] += int(ad["prompt_tokens"])
                    ai_daily_map[d_str]["completionTokens"] += int(ad["completion_tokens"])
                    ai_daily_map[d_str]["total"] += int(ad["prompt_tokens"]) + int(ad["completion_tokens"])

            # 7. Sync health & Storage runaway
            total_bundles = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundles").fetchone()["c"]
            total_acks = self.db.conn.execute("SELECT COUNT(*) AS c FROM bundle_acks").fetchone()["c"]
            stuck_bundles = self.db.conn.execute("""
                SELECT COUNT(*) AS c FROM bundles b
                WHERE NOT EXISTS (SELECT 1 FROM bundle_acks a WHERE a.bundle_id = b.bundle_id)
            """).fetchone()["c"]
            sync_success_rate = round((total_acks / max(1, total_bundles + total_acks)) * 100, 1) if (total_bundles + total_acks) > 0 else 100.0

            top_rooms = self.db.conn.execute("""
                SELECT r.room_id, r.vault_id,
                       COUNT(b.bundle_id) AS bundles_count,
                       COALESCE(SUM(LENGTH(b.payload)), 0) AS cache_bytes
                FROM rooms r
                LEFT JOIN bundles b ON r.room_id = b.room_id
                GROUP BY r.room_id
                ORDER BY cache_bytes DESC
                LIMIT 5
            """).fetchall()

            return {
                "status": "ok",
                "period": period_str,
                "dates": date_list,
                "userGrowth": list(growth_map.values()),
                "appLaunches": list(launches_map.values()),
                "revenue": list(revenue_map.values()),
                "traffic": list(traffic_map.values()),
                "funnel": {
                    "landingViews": landing_views,
                    "ctaClicks": cta_clicks,
                    "paywallViews": paywall_views,
                    "checkoutStarts": checkout_starts,
                    "paidConversions": paid_count,
                    "dropOffRate": drop_off_rate,
                    "steps": steps,
                },
                "aiDistribution": {
                    "meanTokens": mean_tok,
                    "medianTokens": median_tok,
                    "minTokens": min_tok,
                    "maxTokens": max_tok,
                    "totalTokens": total_ai_tokens,
                    "totalCostRub": total_ai_cost,
                    "totalRevenueRub": total_rev,
                    "grossMarginPercent": margin_pct,
                    "topUsers": top_users,
                    "dailyTokens": list(ai_daily_map.values()),
                },
                "syncHealth": {
                    "totalBundles": total_bundles,
                    "totalAcks": total_acks,
                    "successRatePercent": sync_success_rate,
                    "stuckUnackedBundles": stuck_bundles,
                    "topHeavyRooms": [{
                        "roomId": tr["room_id"],
                        "vaultId": tr["vault_id"],
                        "bundlesCount": tr["bundles_count"],
                        "cacheBytes": tr["cache_bytes"],
                    } for tr in top_rooms],
                },
            }, 200

        if method == "POST" and path == "/api/telemetry/event":
            if not self._allow_request(f"telemetry:{self._client_ip(writer, headers)}", RATE_LIMIT_TELEMETRY):
                return {"error": "too_many_requests"}, 429
            event_type = body.get("eventType", "").strip()
            if not event_type:
                raise ApiError(400, "missing_event_type")
            platform = body.get("platform", "web").strip().lower()
            metadata = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
            event_id = self.db.record_telemetry(event_type, platform, metadata)
            return {"status": "ok", "id": event_id}, 200

        if method == "POST" and path == "/api/auth/challenge":
            if not self._allow_request(f"challenge:{self._client_ip(writer, headers)}", RATE_LIMIT_AUTH_CHALLENGE):
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

        if method == "POST" and path == "/api/notify/invite":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            if not self.bot or not self.notify_pepper:
                raise ApiError(503, "notify_bot_not_configured")
            if not self._allow_request(f"notify-invite:{auth['account_id']}", RATE_LIMIT_NOTIFY_INVITE):
                return {"error": "too_many_requests"}, 429
            vault_id = body.get("vaultId", "")
            if not isinstance(vault_id, str) or not vault_id:
                raise ApiError(400, "invalid_vault")
            # A receive-only device has no business queueing messages for the vault.
            self._authorize_vault(auth, vault_id, write=True)
            for _ in range(3):
                code = secrets.token_hex(6)
                route_token = secrets.token_hex(16)
                try:
                    expires_at = self.db.create_notify_invite(vault_id, code, route_token)
                    break
                except sqlite3.IntegrityError:
                    continue
            else:
                raise ApiError(409, "invite_conflict")
            link = f"https://t.me/{self.bot.username}?start={code}" if self.bot.username else None
            return {"code": code, "routeToken": route_token, "link": link,
                    "expiresAt": iso_time(expires_at), "expiresIn": NOTIFY_INVITE_TTL_SECONDS}, 200

        # A capability token belongs in a body, not a query string: proxies and access logs keep
        # URLs long after the request is gone. GET stays for older clients.
        if path == "/api/notify/status" and method in ("GET", "POST"):
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            source = body if method == "POST" else query
            vault_id = source.get("vaultId", "")
            route_token = source.get("routeToken", "")
            if not vault_id or not route_token:
                raise ApiError(400, "invalid_notification")
            self._authorize_vault(auth, vault_id)
            return {"state": self._notify_channel_state(vault_id, route_token)}, 200

        if method == "POST" and path == "/api/notify/arm":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            if not self._allow_request(f"notify-arm:{auth['account_id']}", RATE_LIMIT_NOTIFY_ARM):
                return {"error": "too_many_requests"}, 429
            vault_id = body.get("vaultId", "")
            if not isinstance(vault_id, str) or not vault_id:
                raise ApiError(400, "invalid_notification")
            self._authorize_vault(auth, vault_id, write=True)
            if self.db.count_notify_jobs_for_account(auth["account_id"]) > NOTIFY_MAX_JOBS_PER_ACCOUNT:
                raise ApiError(429, "notify_queue_full")
            armed, dropped = self._arm_notifications(body, vault_id)
            return {"armed": armed, "dropped": dropped}, 200

        if method == "POST" and path == "/api/assistant/enable":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = body.get("vaultId", "")
            route_token = body.get("routeToken", "")
            enabled = body.get("enabled") is not False
            mode = body.get("mode") if isinstance(body.get("mode"), str) else "minimal"
            if mode not in ("minimal", "risky"):
                raise ApiError(400, "invalid_assistant_mode")
            if not isinstance(vault_id, str) or not vault_id or not isinstance(route_token, str) or not route_token:
                raise ApiError(400, "invalid_assistant_link")
            self._authorize_vault(auth, vault_id, write=True)
            route = self.notify.get(route_token)
            if not route or not hmac.compare_digest(route["vault_tag"], self._notify_tag(vault_id)):
                raise ApiError(404, "route_not_found")
            self.db.set_assistant_link(route_token, vault_id, enabled, mode)
            return {"enabled": enabled, "mode": mode}, 200

        # A device that reconnects after the broadcast still owes the chat an answer. The socket
        # message is fire-and-forget, this is the catch-up.
        if method == "GET" and path == "/api/assistant/pending":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = query.get("vaultId", "")
            if not vault_id:
                raise ApiError(400, "invalid_notification")
            self._authorize_vault(auth, vault_id)
            now = time.time()
            pending = [{"requestId": row["id"], "question": row["question"], "mode": row["mode"],
                        "expiresAt": row["expires_at"]}
                       for row in self.db.pending_assistant_requests(vault_id, now)]
            return {"requests": pending}, 200

        if method == "POST" and path == "/api/assistant/answer":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = body.get("vaultId", "")
            request_id = body.get("requestId", "")
            answer = body.get("answer", "")
            if (not isinstance(vault_id, str) or not vault_id or not isinstance(request_id, str)
                    or not request_id or not isinstance(answer, str) or not answer.strip()):
                raise ApiError(400, "invalid_answer")
            # Optional and opaque: the device decides what may be applied, the relay only carries
            # it to the chat and back to whichever device is online when the button is tapped.
            action = body.get("action")
            if action is not None:
                action = self._validate_assistant_action(action)
            self._authorize_vault(auth, vault_id, write=True)
            result = await self._answer_assistant(vault_id, request_id, answer,
                                                  base_url=self._public_base(headers), action=action,
                                                  answered_by=str(auth.get("device_id") or ""))
            return result, 200

        # The device that ran the action closes the loop: the bubble under the answer says what
        # happened and the button goes away, so a second tap cannot ask for the same thing twice.
        if method == "POST" and path == "/api/assistant/applied":
            auth = self._auth(headers)
            self._require_notify_plan(auth)
            vault_id = body.get("vaultId", "")
            request_id = body.get("requestId", "")
            ok = body.get("ok")
            text = body.get("text", "")
            if (not isinstance(vault_id, str) or not vault_id or not isinstance(request_id, str)
                    or not request_id or not isinstance(ok, bool) or not isinstance(text, str)):
                raise ApiError(400, "invalid_applied")
            self._authorize_vault(auth, vault_id, write=True)
            result = await self._apply_assistant_action(vault_id, request_id, ok, text,
                                                        base_url=self._public_base(headers))
            return result, 200

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
            if not self._allow_request(f"pair-create:{self._client_ip(writer, headers)}", RATE_LIMIT_PAIR_CREATE):
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

        if method == "POST" and path == "/api/ai/chat":
            auth_token = self._bearer(headers, allow_raw=not self.require_account_auth)
            if not auth_token:
                return {"error": "unauthorized"}, 401
            if self.require_account_auth:
                auth = self.db.authenticate(auth_token)
                if not auth:
                    return {"error": "unauthorized"}, 401
                if auth["plan"] == "free":
                    return {"error": "subscription_required"}, 403
                account_id = auth["account_id"]
            else:
                if auth_token.startswith("free_") or auth_token == "free":
                    return {"error": "subscription_required"}, 403
                account_id = "self-hosted"

            master_api_key = os.environ.get("KIE_API_KEY", "").strip()
            if not master_api_key:
                return {"error": "upstream_not_configured"}, 503

            allowed_model = self._ai_model()
            requested_model = str(body.get("model") or "").strip()
            if not requested_model or self._normalize_ai_model(requested_model) != self._normalize_ai_model(allowed_model):
                return {"error": "model_not_allowed", "allowed": allowed_model}, 400

            daily_limit = self._ai_daily_limit()
            if daily_limit > 0 and self.db.count_ai_requests_since(account_id, time.time() - 86400) >= daily_limit:
                return {"error": "ai_daily_limit", "limit": daily_limit}, 429

            # KIE chat models speak the OpenAI Responses protocol, not /v1/chat/completions.
            upstream_payload = {**body, "model": allowed_model, "stream": False}
            started = time.time()
            outcome, raw = await asyncio.to_thread(
                SlagRelayServer._call_ai_upstream,
                f"{self._kie_base_url()}/openai/v1/responses",
                master_api_key, upstream_payload, self._ai_timeout_seconds())
            latency_ms = (time.time() - started) * 1000

            if outcome == "timeout":
                return {"error": "upstream_timeout"}, 504
            if outcome == "network" or not isinstance(outcome, int):
                return {"error": "upstream_gateway_failed"}, 502
            if not 200 <= outcome < 300:
                logger.warning("AI upstream HTTP %s", outcome)
                return {"error": "upstream_gateway_failed", "upstreamStatus": outcome}, 502

            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"error": "upstream_invalid_response"}, 502
            if not isinstance(data, dict):
                return {"error": "upstream_invalid_response"}, 502

            error_obj = data.get("error")
            if error_obj:
                message = error_obj.get("message") if isinstance(error_obj, dict) else error_obj
                logger.warning("AI upstream error: %s", str(message)[:200])
                return {"error": "upstream_error", "detail": str(message)[:200]}, 502

            upstream_code = data.get("code")
            if upstream_code is not None and upstream_code != 200:
                message = str(data.get("msg") or "upstream_error")[:200]
                logger.warning("AI upstream code %s: %s", upstream_code, message)
                status = 429 if upstream_code == 429 else 402 if upstream_code == 402 else 502
                return {"error": message, "code": upstream_code}, status

            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            # Anything without a Responses-shaped payload is not a real answer —
            # returning it as 200 is exactly how the old stub poisoned the client.
            if not isinstance(data.get("output"), list):
                return {"error": "upstream_invalid_response"}, 502
            self.db.record_ai_usage(
                account_id,
                str(data.get("model") or allowed_model),
                int(usage.get("input_tokens") or 0),
                int(usage.get("output_tokens") or 0),
                latency_ms,
            )
            return data, 200

        if method == "POST" and path in ("/api/ai/vision", "/api/ai/audio"):
            auth_token = self._bearer(headers, allow_raw=not self.require_account_auth)
            if not auth_token:
                return {"error": "unauthorized"}, 401
            if self.require_account_auth:
                auth = self.db.authenticate(auth_token)
                if not auth:
                    return {"error": "unauthorized"}, 401
                if auth["plan"] == "free":
                    return {"error": "subscription_required"}, 403
                account_id = auth["account_id"]
            else:
                if auth_token.startswith("free_") or auth_token == "free":
                    return {"error": "subscription_required"}, 403
                account_id = "self-hosted"

            groq_key = os.environ.get("GROQ_API_KEY", "").strip()
            if not groq_key:
                return {"error": "upstream_not_configured"}, 503

            daily_limit = self._ai_daily_limit()
            if daily_limit > 0 and self.db.count_ai_requests_since(account_id, time.time() - 86400) >= daily_limit:
                return {"error": "ai_daily_limit", "limit": daily_limit}, 429

            data_url = str(body.get("dataUrl") or "")
            if not data_url.startswith("data:") or "," not in data_url:
                return {"error": "invalid_data_url"}, 400
            prompt = str(body.get("prompt") or "")[:1200]
            is_vision = path.endswith("/vision")

            started = time.time()
            if is_vision:
                outcome, raw, model_used = await asyncio.to_thread(
                    SlagRelayServer._call_groq_vision, groq_key, data_url, prompt, self._ai_timeout_seconds())
            else:
                outcome, raw, model_used = await asyncio.to_thread(
                    SlagRelayServer._call_groq_audio, groq_key, data_url, prompt,
                    str(body.get("fileName") or "audio.webm"), self._ai_timeout_seconds())
            latency_ms = (time.time() - started) * 1000

            if outcome == "timeout":
                return {"error": "upstream_timeout"}, 504
            if outcome == "too_large":
                return {"error": "payload_too_large"}, 413
            if outcome == "bad_data":
                return {"error": "invalid_data_url"}, 400
            if outcome == "network" or not isinstance(outcome, int):
                return {"error": "upstream_gateway_failed"}, 502
            if not 200 <= outcome < 300:
                detail = ""
                try:
                    err_payload = json.loads(raw.decode("utf-8"))
                    err_obj = err_payload.get("error") if isinstance(err_payload, dict) else None
                    detail = str(err_obj.get("message") if isinstance(err_obj, dict) else err_obj or "")[:200]
                except (UnicodeDecodeError, json.JSONDecodeError):
                    detail = ""
                # Groq rejects bad media with 400/413/422 — surface that as a client error.
                mapped = 429 if outcome == 429 else 400 if outcome in (400, 413, 422) else 502
                logger.warning("Media upstream HTTP %s: %s", outcome, detail)
                return {"error": "upstream_rejected" if mapped == 400 else "upstream_gateway_failed",
                        "upstreamStatus": outcome, "detail": detail}, mapped

            try:
                data = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"error": "upstream_invalid_response"}, 502
            if not isinstance(data, dict):
                return {"error": "upstream_invalid_response"}, 502
            if data.get("error"):
                message = data["error"].get("message") if isinstance(data["error"], dict) else data["error"]
                logger.warning("Media upstream error: %s", str(message)[:200])
                return {"error": "upstream_error", "detail": str(message)[:200]}, 502

            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            if is_vision:
                content = str(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
                parsed = None
                try:
                    start, end = content.find("{"), content.rfind("}")
                    if start != -1 and end > start:
                        parsed = json.loads(content[start:end + 1])
                except json.JSONDecodeError:
                    parsed = None
                extracted = str((parsed or {}).get("extractedText") or "").strip()
                summary = str((parsed or {}).get("summary") or content).strip()[:240]
            else:
                extracted = str(data.get("text") or "").strip()
                summary = extracted.split("\n")[0][:240]

            self.db.record_ai_usage(
                account_id, model_used,
                int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0),
                latency_ms)
            return {"extractedText": extracted, "summary": summary, "model": model_used,
                    "latencyMs": round(latency_ms)}, 200

        if method in ("GET", "HEAD") and not path.startswith("/api/") and path != "/health":
            static_dir = os.environ.get("SLAG_STATIC_DIR") or str(Path(__file__).resolve().parent / "dist")
            if os.path.isdir(static_dir):
                clean_path = path.lstrip("/")
                static_root = Path(static_dir).resolve()
                target = (static_root / clean_path).resolve()
                try:
                    target.relative_to(static_root)
                except ValueError:
                    raise ApiError(403, "access_denied")
                if clean_path and target.is_file():
                    mime, _ = mimetypes.guess_type(str(target))
                    data = b"" if method == "HEAD" else target.read_bytes()
                    await self._send_response(writer, self._http_response(200, "OK", mime or "application/octet-stream", data))
                    return None
                index_html = Path(static_dir) / "index.html"
                if index_html.is_file():
                    data = b"" if method == "HEAD" else index_html.read_bytes()
                    await self._send_response(writer, self._http_response(200, "OK", "text/html; charset=utf-8", data))
                    return None

        return {"error": "not_found", "path": path}, 404

    async def handle_ws_upgrade(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                                method: str, full_path: str, headers: dict) -> None:
        parsed = urllib.parse.urlsplit(full_path)
        path = parsed.path
        query = {key: values[-1] for key, values in urllib.parse.parse_qs(parsed.query).items()}
        try:
            account_id = vault_id = None
            max_cache = self.db.DEFAULT_MAX_CACHE_BYTES
            device_id = query.get("device", f"device-{secrets.token_hex(4)}")
            room_id = urllib.parse.unquote(path[4:]).strip("/") if path.startswith("/ws/") else ""
            auth = None
            if not room_id:
                raise ApiError(404, "room_not_found")
            room_vault = self.db.room_vault(room_id)
            if self.require_account_auth or query.get("token") or self._bearer(headers) or room_vault:
                token = query.get("token", "") or self._bearer(headers)
                auth = self.db.authenticate(token)
                if not auth:
                    raise ApiError(401, "unauthorized")
                if device_id != auth["device_id"]:
                    raise ApiError(403, "device_mismatch")
                vault_id = query.get("vault", "")
                account_id = self._authorize_room(auth, room_id, vault_id)
                max_cache = PLANS[auth["plan"]]["cache_mb"] * 1024 * 1024

            ws_key = headers.get("sec-websocket-key", "")
            if not ws_key:
                raise ApiError(400, "missing_sec_websocket_key")
            accept = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode("utf-8")).digest()).decode("ascii")
            writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode("ascii"))
            await writer.drain()
            conn = WebSocketConnection(reader, writer, room_id, device_id, account_id, max_cache)
            conn.token_hash = auth["token_hash"] if auth else None
            conn.vault_id = vault_id
            self.rooms.setdefault(room_id, set()).add(conn)
            self.db.touch_room(room_id, vault_id)
            logger.info("WebSocket connected")
            await conn.send_text(json.dumps({"type": "welcome", "deviceId": device_id, "roomId": room_id,
                                             "connectedDevices": len(self.rooms[room_id]), "binary": True}))
            for item in self.db.get_pending_bundles(room_id, device_id):
                self._check_ws_auth(conn)
                bundle_payload = item["payload"]
                if isinstance(bundle_payload, dict):
                    bundle_payload["syncId"] = item.get("syncId", 0)
                await conn.send_text(json.dumps({"type": "bundle", "bundle": bundle_payload}))
            try:
                while not conn.closed:
                    frame = await conn.read_frame()
                    if frame is None:
                        break
                    opcode, payload = frame
                    if opcode == 0x8:
                        break
                    if opcode == 0x1:
                        await self._handle_ws_message(conn, payload.decode("utf-8", errors="replace"))
                    elif opcode == 0x2:
                        await self._handle_ws_binary(conn, payload)
            finally:
                if room_id in self.rooms:
                    self.rooms[room_id].discard(conn)
                    if not self.rooms[room_id]:
                        del self.rooms[room_id]
                await conn.close()
                logger.info("WebSocket disconnected")
        except ApiError as exc:
            await self._send_response(writer, self._json_response({"error": exc.error}, exc.status))
        except Exception as exc:
            logger.debug("WS error: %s", type(exc).__name__)
            writer.close()

    def _check_ws_auth(self, conn: WebSocketConnection, write: bool = False) -> None:
        if conn.token_hash:
            auth = self.db.authenticate_hash(conn.token_hash)
            if not auth:
                raise ApiError(401, "unauthorized")
            self._authorize_room(auth, conn.room_id, conn.vault_id)
            self._authorize_vault(auth, conn.vault_id, write=write)
            conn.max_cache_bytes = PLANS[auth["plan"]]["cache_mb"] * 1024 * 1024
        else:
            if self.require_account_auth or self.db.room_vault(conn.room_id):
                raise ApiError(401, "unauthorized")

    async def _handle_ws_message(self, conn: WebSocketConnection, text: str) -> None:
        try:
            msg = json.loads(text)
            if not isinstance(msg, dict):
                return
            self._check_ws_auth(conn, write=msg.get("type") == "bundle")
            await self._process_ws_message(conn, msg)
        except ApiError as exc:
            await conn.send_text(json.dumps({"type": "error", "code": exc.error}))
        except (ValueError, TypeError):
            await conn.send_text(json.dumps({"type": "error", "code": "invalid_message"}))

    async def _process_ws_message(self, conn: WebSocketConnection, msg: dict) -> None:
        msg_type = msg.get("type")
        if msg_type == "ping":
            await conn.send_text(json.dumps({"type": "pong", "ts": int(time.time())}))
            return
        if msg_type == "assistant_probe_ack":
            # The chosen-one election: latency, plus whether this device could even run a model.
            probe_id = msg.get("id")
            probe = self.assistant_probes.get(probe_id) if isinstance(probe_id, str) else None
            if not probe:
                return
            sent_at = probe["sent"].get(conn.device_id)
            if sent_at is None:
                return
            probe["results"][conn.device_id] = (
                int((time.monotonic() - sent_at) * 1000), msg.get("aiReady") is True)
            # Everyone spoke, or the quiet ones will be timed out by the caller.
            if len(probe["results"]) >= len(probe["sent"]):
                probe["event"].set()
            return
        if msg_type == "assistant_stage":
            await self._handle_assistant_stage(conn, msg)
            return
        if msg_type == "ack":
            bundle_ids = msg.get("bundleIds") or ([msg.get("bundleId")] if msg.get("bundleId") else [])
            if bundle_ids:
                self.db.record_acks(conn.device_id, bundle_ids, conn.room_id)
            return
        if msg_type == "bundle":
            bundle = msg.get("bundle", {})
            if not isinstance(bundle, dict):
                return
            await self._ingest_ws_bundle(conn, bundle)

    async def _handle_ws_binary(self, conn: WebSocketConnection, data: bytes) -> None:
        try:
            bundle = decode_bundle_frame(data, conn.device_id)
        except ValueError:
            await conn.send_text(json.dumps({"type": "error", "code": "invalid_frame"}))
            return
        try:
            self._check_ws_auth(conn, write=True)
            await self._ingest_ws_bundle(conn, bundle)
        except ApiError as exc:
            await conn.send_text(json.dumps({"type": "error", "code": exc.error}))

    async def _ingest_ws_bundle(self, conn: WebSocketConnection, bundle: dict) -> None:
        bundle_id = bundle.get("bundleId", secrets.token_hex(12))
        from_device = bundle.get("fromDeviceId", conn.device_id)
        if conn.account_id and from_device != conn.device_id:
            await conn.send_text(json.dumps({"type": "error", "code": "device_mismatch"}))
            return
        seq = int(bundle.get("sequence", 0))
        timestamp = bundle.get("timestamp", str(time.time()))
        payload_str = json.dumps(bundle)
        vault_id = self.db.room_vault(conn.room_id)
        saved = self.db.save_bundle(conn.room_id, bundle_id, from_device, seq, timestamp, payload_str,
                                    max_cache_bytes=conn.max_cache_bytes, account_id=conn.account_id, vault_id=vault_id)
        if not saved:
            await conn.send_text(json.dumps({"type": "error", "code": "cache_limit_exceeded"}))
            return
        sync_id = saved
        bundle_to_broadcast = dict(bundle)
        bundle_to_broadcast["syncId"] = sync_id
        await self._broadcast_to_room(conn.room_id, json.dumps({"type": "bundle", "bundle": bundle_to_broadcast}), exclude_device=conn.device_id)
        await conn.send_text(json.dumps({"type": "server_ack", "bundleId": bundle_id, "sequence": seq, "syncId": sync_id}))

    async def _broadcast_to_room(self, room_id: str, message_str: str, exclude_device: Optional[str] = None) -> None:
        for client in list(self.rooms.get(room_id, set())):
            if exclude_device and client.device_id == exclude_device:
                continue
            try:
                self._check_ws_auth(client)
            except ApiError:
                await client.close()
                continue
            await client.send_text(message_str)

    async def background_cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            try:
                self.db.cleanup_expired()
                self.db.purge_delivery_events(time.time() - DELIVERY_EVENT_KEEP_SECONDS)
                self._prune_rate_limits()
            except Exception as exc:
                logger.error("Cleanup error: %s", exc)

    async def run(self) -> None:
        if ":" in self.host:
            # A plain `::` bind is v6-only in asyncio, and every IPv4 client then gets "connection
            # refused". dualstack_ipv6 keeps both families on one socket and one event loop.
            sock = socket.create_server((self.host, self.port), family=socket.AF_INET6, dualstack_ipv6=True)
            server = await asyncio.start_server(self.handle_connection, sock=sock)
        else:
            server = await asyncio.start_server(self.handle_connection, self.host, self.port)
        addrs = ", ".join(str(sock.getsockname()) for sock in server.sockets)
        logger.info("SLAG Relay Server running on %s (DB: %s, account auth: %s)", addrs, self.db.db_path, self.require_account_auth)
        asyncio.create_task(self.background_cleanup_loop())
        asyncio.create_task(self.notify_delivery_loop())
        if self.bot:
            asyncio.create_task(self.assistant_expiry_loop())
            asyncio.create_task(self.bot_loop())
        else:
            logger.info("Telegram bot is off (SLAG_TG_BOT_TOKEN is empty): notifications stay queued")
        async with server:
            await server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="SLAG v2 Zero-Knowledge Relay Server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--db", default="data/relay.db")
    parser.add_argument("--admin-token", default=os.environ.get("SLAG_ADMIN_TOKEN"))
    parser.add_argument("--trusted-proxies", default=os.environ.get("SLAG_TRUSTED_PROXIES", ""),
                        help="comma-separated IPs/CIDRs allowed to set X-Forwarded-For")
    parser.add_argument("--bot-token", default=os.environ.get("SLAG_TG_BOT_TOKEN", ""),
                        help="Telegram bot token; enables reminder delivery")
    parser.add_argument("--notify-pepper", default=os.environ.get("SLAG_NOTIFY_PEPPER", ""),
                        help="secret that scopes a telegram route to one vault; required for invites")
    args = parser.parse_args()
    relay = SlagRelayServer(args.host, args.port, args.db, admin_token=args.admin_token,
                            trusted_proxies=args.trusted_proxies, bot_token=args.bot_token,
                            notify_pepper=args.notify_pepper)
    try:
        asyncio.run(relay.run())
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")


if __name__ == "__main__":
    main()
