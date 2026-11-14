#!/usr/bin/env python3
"""SLAG zero-knowledge asyncio relay with optional account authentication.

Сборка процесса: константы — в `settings`, хранилище — в `store`, сокет — в `wire`,
карточки и текст бота — в `assistant_card` и `tg`. Здесь остаётся сам сервер и его миксины.
"""

from __future__ import annotations

import argparse
import asyncio
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
from assistant_actions import AssistantActions
from bot import BotDomain
from router import HttpRouter
from http_plumbing import HttpPlumbing
from realtime import Realtime
from routes_health import HealthRoutes
from routes_admin import AdminRoutes
from routes_admin_ops import AdminOpsRoutes
from routes_auth import AuthRoutes
from routes_notify import NotifyRoutes
from routes_vaults import VaultRoutes
from routes_ai import AiRoutes
from routes_static import StaticRoutes


class SlagRelayServer(
    HttpPlumbing, HttpRouter,          # чтение запроса, ответы, диспетчер по доменам
    HealthRoutes, AdminRoutes, AdminOpsRoutes, AuthRoutes,   # http-домены
    NotifyRoutes, VaultRoutes, AiRoutes, StaticRoutes,
    Realtime,                          # websocket: кадры, бандлы, рассылка
    BotDomain, AssistantDomain, AssistantActions, DeliveryDomain, AiProxy,  # telegram и модели
):
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
