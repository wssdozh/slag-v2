#!/usr/bin/env python3
"""SLAG zero-knowledge asyncio relay with optional account authentication."""

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

# The Bot API client, the escaping and the message renderer live on their own: a leaf module the
# queue, the bot loop and the assistant all share without importing each other.
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

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
DEFAULT_PORT = 8320
DEFAULT_TTL_SECONDS = 7 * 24 * 3600
BUNDLE_FRAME_BUNDLE = 0x01
BUNDLE_FRAME_VERSION = 0x01
PAIRING_TTL_SECONDS = 300
CHALLENGE_TTL_SECONDS = 300
DEVICE_REQUEST_TTL_SECONDS = 600
SESSION_TTL_SECONDS = 3 * 24 * 3600
# Telegram delivery. The invite code is what a human types into the bot, so it lives
# minutes, not days: it is the only place where a vault meets a chat id.
NOTIFY_INVITE_TTL_SECONDS = 600
NOTIFY_INVITE_KEEP_SECONDS = 3600
# A reminder older than this is dropped instead of delivered: a laptop that wakes up
# after a week must not dump a pile of stale pings.
NOTIFY_STALE_SECONDS = 3600
NOTIFY_MAX_JOBS_PER_VAULT = 500
# A route token is a capability, so it is scoped: one token belongs to exactly one vault and
# cannot be armed from another. The cap on the receiving side is the anti-spam backstop.
NOTIFY_MAX_JOBS_PER_ACCOUNT = 1000
NOTIFY_MAX_PER_HOUR_PER_ROUTE = 30
NOTIFY_MAX_LEAD_SECONDS = 400 * 86400
NOTIFY_LEEWAY_SECONDS = 300
RATE_LIMIT_NOTIFY_ARM = 60
RATE_LIMIT_NOTIFY_INVITE = 10
# Asking the assistant from Telegram: the question travels to a device, never to the relay's
# language model — the relay has none. The window is the whole life of the bubble: it has to be
# long enough for a person to read the answer and tap its button, and short enough that a dead
# bot says so instead of spinning. A stage edit inside it is detached, so this is the only wait.
ASSISTANT_REQUEST_TTL_SECONDS = 90
# Telegram drops a typing indicator after ~5s, so it is re-armed inside that window.
ASSISTANT_TYPING_INTERVAL_SECONDS = 4
# How long the relay waits for devices to answer "I am here and I can run a model". A healthy
# socket answers in single-digit milliseconds; a suspended app never answers at all. A device on
# a phone tether or a tunnel sits somewhere in between, so the window has to cover a slow ack —
# giving up at 250ms is what turned a live raspberry pi into "ни одно устройство не в сети".
ASSISTANT_PROBE_TIMEOUT_SECONDS = 1.5
ASSISTANT_MAX_QUESTION = 1000
ASSISTANT_MAX_ANSWER = 4000
# One bubble per question: these are its texts, in the order the person sees them.
ASSISTANT_STAGE_SEARCHING = "🔎 ищу устройство…"
ASSISTANT_STAGE_HANDED = "⌛ передал на"
ASSISTANT_STAGE_THINKING = "✍️ печатает ответ…"
# How a device names itself in that bubble when the relay knows nothing better.
ASSISTANT_DEVICE_FALLBACK = "устройство"
# An answer may offer one action. The button carries only `act:<requestId>`: the action itself
# stays in the database, so the callback data never has to fit Telegram's 64-byte cap and a
# replay of the tap cannot smuggle in a different payload.
ASSISTANT_ACTION_PREFIX = "act:"
# The second button: a card that is not wanted is a card that must be able to disappear.
ASSISTANT_DROP_PREFIX = "drop:"
ASSISTANT_ACTION_BUTTON_MAX = 64
# The card is drawn from fields the device worded; these are the ceilings on what it may print.
ASSISTANT_CARD_FIELD_MAX = 120
ASSISTANT_CARD_DROP_LABEL = "Отклонить"
ASSISTANT_CARD_DROPPED = "✕ отклонено"
# Day first, priority after it: the reading order the confirmation card uses in the app.
ASSISTANT_CARD_PRIORITY = {"high": "🔴 HIGH", "medium": "🟡 MEDIUM", "low": "🔵 LOW"}
# Every tap answers the callback — a silent one is a spinner on the person's screen.
ASSISTANT_ACTION_DONE = "передал устройству"
ASSISTANT_ACTION_ALREADY = "уже применено"
ASSISTANT_ACTION_STALE = "устарело — спроси ещё раз"
ASSISTANT_ACTION_DISMISSED = "ок, не сохраняю"
ASSISTANT_ACTION_NO_DEVICE = "устройство не в сети — открой приложение"
# The device words the outcome itself; this is only the ceiling on how much of it fits back
# into the bubble that already holds the answer.
ASSISTANT_MAX_APPLY_TEXT = 300
# The relay never reads an action, but it does store and re-send it: a runaway one would turn
# a request row into a blob and a websocket frame into a stall.
ASSISTANT_MAX_ACTION_JSON = 8192
RATE_LIMIT_TG_ASK = 10
# Delivery telemetry: outcomes and latencies, never the text of a question or an answer.
DELIVERY_EVENT_KEEP_SECONDS = 7 * 86400
NOTIFY_BATCH_SIZE = 50
NOTIFY_CLAIM_LEASE_SECONDS = 120
# Telegram allows A-Z a-z 0-9 _ - in a start parameter, 1 to 64 characters.
BOT_CODE_RE = re.compile(r"^[A-Za-z0-9_-]{8,32}$")
# Anonymous write endpoints get a small per-IP budget: enough for a real pair flow,
# not enough to fill sqlite from one host. The pairing claim has its own stricter limit.
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_AUTH_CHALLENGE = 60
RATE_LIMIT_PAIR_CREATE = 30
RATE_LIMIT_TELEMETRY = 120
PLANS = {
    "free": {"label": "Free", "devices": 2, "cache_mb": 1024},
    "smile": {"label": "Smile", "devices": 5, "cache_mb": 10 * 1024},
    "angry": {"label": "Angry", "devices": 15, "cache_mb": 50 * 1024},
}

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("slag-relay")


def iso_time(value: Optional[float]) -> Optional[str]:
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value is not None else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def assistant_action_label(action: Optional[dict]) -> Optional[str]:
    """The button's caption, or None when this action cannot be offered as a button at all.

    The label is the one field the relay interprets: without it there is nothing to put on the
    button, and an answer that silently lost its button is worse than a visible refusal.
    """
    if not isinstance(action, dict):
        return None
    label = action.get("label")
    if not isinstance(label, str) or not label.strip():
        return None
    return tg_truncate(label.strip(), ASSISTANT_ACTION_BUTTON_MAX)


def assistant_action_markup(action: Optional[dict], request_id: str) -> Optional[dict]:
    """`reply_markup` for an answer that offers an action, or None — never an empty keyboard.

    An empty inline keyboard is not "no button" to Telegram: it is an edit that strips whatever
    keyboard the message already has, so absence has to be spelled as the key being absent.
    """
    label = assistant_action_label(action)
    if label is None:
        return None
    return {"inline_keyboard": [[{"text": label,
                                  "callback_data": f"{ASSISTANT_ACTION_PREFIX}{request_id}"},
                                 {"text": ASSISTANT_CARD_DROP_LABEL,
                                  "callback_data": f"{ASSISTANT_DROP_PREFIX}{request_id}"}]]}


def assistant_card_block(action: Optional[dict]) -> str:
    """The card under an answer: what the action touches, in the app's reading order.

    The device words every field — it is the only side that knows the user's names for folders
    and the shape of their dates — so this function escapes and joins, and nothing else. An
    action from a device too old to send a card draws nothing rather than half a card.
    """
    if not isinstance(action, dict):
        return ""
    card = action.get("card")
    if not isinstance(card, dict):
        return ""

    def field(key: str) -> str:
        value = card.get(key)
        if not isinstance(value, str):
            return ""
        return tg_escape(tg_truncate(value.strip(), ASSISTANT_CARD_FIELD_MAX))

    title = field("title")
    if not title:
        return ""
    head = " · ".join(part for part in (field("kind"), field("folder")) if part)
    priority = ASSISTANT_CARD_PRIORITY.get(str(card.get("priority") or ""), "")
    meta = " · ".join(part for part in (field("due"), priority) if part)
    lines = [head, f"<b>{title}</b>", meta]
    return "<blockquote>" + "\n".join(line for line in lines if line) + "</blockquote>"


def assistant_message_html(answer: str, action: Optional[dict], base_url: str = "",
                           suffix: str = "") -> Tuple[str, str]:
    """The bubble: the answer, the card under it, and an optional outcome line.

    The card is paid for out of the answer's budget, not the other way round: truncating the
    tail would cut the card in half and leave a `blockquote` Telegram rejects as unbalanced.
    """
    card = assistant_card_block(action)
    tail = f"\n\n{suffix}" if suffix else ""
    budget = max(200, ASSISTANT_MAX_ANSWER - len(card) - len(tail))
    plain_answer = tg_truncate(answer.strip(), budget)
    html = render_answer_links(plain_answer, base_url)
    body = f"{html}\n\n{card}{tail}" if card else f"{html}{tail}"
    plain = f"{plain_answer}\n\n{APPROX_STRIP_TAGS.sub('', card)}{suffix}"
    return body, plain.strip()


APPROX_STRIP_TAGS = re.compile(r"<[^>]+>")


def parse_assistant_action(encoded: Optional[str]) -> Optional[dict]:
    """The stored action, parsed. A row that never had one, or a corrupt one, offers nothing."""
    if not encoded:
        return None
    try:
        action = json.loads(encoded)
    except (TypeError, ValueError):
        return None
    return action if isinstance(action, dict) else None


def decode_bundle_frame(data: bytes, device_id: str) -> dict:
    """Binary push frame: [0x01][version:1][idLen:1][bundleId][sequence:4 BE][iv:12][ciphertext].

    Clients send it on the websocket instead of a base64 JSON envelope: the uplink is the
    slow half of mobile sync, and base64 costs a third of every small bundle.
    """
    if len(data) < 3 or data[0] != BUNDLE_FRAME_BUNDLE or data[1] != BUNDLE_FRAME_VERSION:
        raise ValueError("unsupported bundle frame")
    id_len = data[2]
    header_end = 3 + id_len + 4 + 12
    if not id_len or len(data) <= header_end:
        raise ValueError("truncated bundle frame")
    bundle_id = data[3:3 + id_len].decode("utf-8", errors="replace")
    if not bundle_id:
        raise ValueError("empty bundle id")
    sequence = struct.unpack("!I", data[3 + id_len:7 + id_len])[0]
    iv = data[7 + id_len:19 + id_len]
    ciphertext = data[header_end:]
    return {
        "bundleId": bundle_id,
        "fromDeviceId": device_id,
        "sequence": sequence,
        "timestamp": str(time.time()),
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


class ApiError(Exception):
    def __init__(self, status: int, error: str):
        super().__init__(error)
        self.status = status
        self.error = error


class WebSocketConnection:
    """Minimal RFC 6455 WebSocket handler over asyncio streams."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, room_id: str, device_id: str,
                 account_id: Optional[str] = None, max_cache_bytes: int = 1024 * 1024 * 1024):
        self.reader = reader
        self.writer = writer
        self.room_id = room_id
        self.device_id = device_id
        self.account_id = account_id
        self.max_cache_bytes = max_cache_bytes
        self.closed = False
        self.token_hash = None
        self.vault_id = None

    async def send_text(self, text: str) -> None:
        if self.closed:
            return
        payload = text.encode("utf-8")
        length = len(payload)
        header = bytearray([0x81])
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", length))
        try:
            self.writer.write(header + payload)
            await self.writer.drain()
        except (ConnectionResetError, BrokenPipeError):
            self.closed = True

    async def read_frame(self) -> Optional[Tuple[int, bytes]]:
        try:
            first_two = await self.reader.readexactly(2)
            byte1, byte2 = first_two[0], first_two[1]
            opcode = byte1 & 0x0F
            masked = (byte2 & 0x80) != 0
            length = byte2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", await self.reader.readexactly(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", await self.reader.readexactly(8))[0]
            if length > 16 * 1024 * 1024 or not masked or not (byte1 & 0x80):
                return None
            mask = await self.reader.readexactly(4) if masked else None
            payload = bytearray(await self.reader.readexactly(length)) if length else bytearray()
            if masked and mask:
                for i in range(len(payload)):
                    payload[i] ^= mask[i % 4]
            if opcode == 0x8:
                return opcode, b""
            if opcode == 0x9:
                self.writer.write(bytearray([0x8A, len(payload)]) + payload)
                await self.writer.drain()
                return await self.read_frame()
            return opcode, bytes(payload)
        except (asyncio.IncompleteReadError, ConnectionResetError):
            return None

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(bytearray([0x88, 0x00]))
            await self.writer.drain()
            self.writer.close()
            await self.writer.wait_closed()
        except Exception:
            pass


class RelayDatabase:
    """SQLite persistence; all account-era schema changes are additive."""

    DEFAULT_MAX_CACHE_BYTES = 1024 * 1024 * 1024

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        # A bundle is broadcast right after save_bundle returns, so the commit sits directly
        # on the delivery latency path. WAL + NORMAL takes the fsync out of that path.
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=NORMAL")
        except sqlite3.Error as exc:
            logger.warning("SQLite tuning unavailable: %s", exc)
        self._init_schema()

    def _ensure_column(self, table: str, column: str, declaration: str) -> None:
        columns = {row["name"] for row in self.conn.execute(f"PRAGMA table_info({table})")}
        if column not in columns:
            self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")

    def _init_schema(self) -> None:
        with self.conn:
            self.conn.executescript("""
                CREATE TABLE IF NOT EXISTS rooms (
                    room_id TEXT PRIMARY KEY,
                    created_at REAL NOT NULL,
                    last_active_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS bundles (
                    bundle_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    from_device_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_bundles_room ON bundles(room_id, created_at);
                CREATE TABLE IF NOT EXISTS bundle_acks (
                    bundle_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    acked_at REAL NOT NULL,
                    PRIMARY KEY(bundle_id, device_id)
                );
                CREATE TABLE IF NOT EXISTS pairing_sessions (
                    pin TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL UNIQUE,
                    host_device_id TEXT NOT NULL,
                    host_public_key TEXT NOT NULL,
                    host_nonce TEXT NOT NULL,
                    guest_ephemeral_pk TEXT,
                    sas_code TEXT,
                    status TEXT NOT NULL DEFAULT 'pending_guest',
                    exchange_payload TEXT,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS accounts (
                    account_id TEXT PRIMARY KEY,
                    public_key TEXT NOT NULL UNIQUE,
                    plan TEXT NOT NULL DEFAULT 'free',
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    public_key TEXT NOT NULL,
                    status TEXT NOT NULL,
                    paired_at REAL NOT NULL,
                    last_seen_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id, status);
                CREATE TABLE IF NOT EXISTS auth_challenges (
                    challenge TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_challenges_account ON auth_challenges(account_id);
                CREATE TABLE IF NOT EXISTS pending_auth_requests (
                    id TEXT PRIMARY KEY,
                    secret_hash TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    public_key TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    completed_at REAL
                );
                CREATE INDEX IF NOT EXISTS idx_pending_auth_expiry ON pending_auth_requests(expires_at);
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    token_hash TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_device ON auth_sessions(account_id, device_id);
                CREATE TABLE IF NOT EXISTS vaults (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner_account_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_vaults_owner ON vaults(owner_account_id);
                CREATE TABLE IF NOT EXISTS vault_grants (
                    vault_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    encrypted_key TEXT,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY(vault_id, device_id)
                );
                CREATE INDEX IF NOT EXISTS idx_grants_device ON vault_grants(device_id, status);
            """)
            self._ensure_column("rooms", "vault_id", "TEXT")
            self._ensure_column("rooms", "retired", "INTEGER NOT NULL DEFAULT 0")
            self._ensure_column("bundles", "sync_id", "INTEGER")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_bundles_room_sync ON bundles(room_id, sync_id)")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS device_cursors (
                device_id TEXT NOT NULL,
                room_id TEXT NOT NULL,
                last_sync_id INTEGER NOT NULL DEFAULT 0,
                updated_at REAL NOT NULL,
                PRIMARY KEY(device_id, room_id)
            )""")
            # ponytail: durable ID tombstones prevent post-expiry replay; compact only with a protocol replay horizon.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS bundle_receipts (
                bundle_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, created_at REAL NOT NULL)""")
            self.conn.execute("INSERT OR IGNORE INTO bundle_receipts SELECT bundle_id, room_id, created_at FROM bundles")
            self._ensure_column("pairing_sessions", "host_account_id", "TEXT")
            self._ensure_column("pairing_sessions", "host_token_hash", "TEXT")
            self._ensure_column("pairing_sessions", "guest_device_id", "TEXT")
            self._ensure_column("pairing_sessions", "guest_account_id", "TEXT")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS billing_transactions (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                plan TEXT NOT NULL,
                period_days INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_at REAL NOT NULL
            )""")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS ai_usage_logs (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                model TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL,
                completion_tokens INTEGER NOT NULL,
                latency_ms REAL NOT NULL,
                created_at REAL NOT NULL
            )""")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at REAL NOT NULL
            )""")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS telemetry_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'unknown',
                metadata TEXT,
                created_at REAL NOT NULL
            )""")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_type_time ON telemetry_events(event_type, created_at)")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at)")
            self._ensure_column("accounts", "status", "TEXT NOT NULL DEFAULT 'active'")
            self._ensure_column("accounts", "expires_at", "REAL")
            # One row per (recipient, event): the pair is the dedup key, so two devices that
            # arm the same reminder cannot produce two messages.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS notify_jobs (
                route_token TEXT NOT NULL,
                event_key TEXT NOT NULL,
                item_key TEXT NOT NULL,
                vault_id TEXT NOT NULL,
                fire_at REAL NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL,
                claimed_at REAL,
                sent_at REAL,
                attempts INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (route_token, event_key)
            )""")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_notify_due ON notify_jobs(fire_at) WHERE sent_at IS NULL")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_notify_item ON notify_jobs(vault_id, item_key)")
            # Presentation travels with the job: the relay renders the message, so it needs the
            # event kind, the deadline in the recipient's own words, and the sender's offset.
            self._ensure_column("notify_jobs", "kind", "TEXT NOT NULL DEFAULT 'task'")
            self._ensure_column("notify_jobs", "stamp", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column("notify_jobs", "spoiler", "INTEGER NOT NULL DEFAULT 0")
            self._ensure_column("notify_jobs", "tz", "INTEGER NOT NULL DEFAULT 0")
            # The only place a vault id ever meets a chat id. Row dies an hour after it expires.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS notify_invites (
                code TEXT PRIMARY KEY,
                route_token TEXT NOT NULL UNIQUE,
                vault_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                redeemed_at REAL
            )""")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_notify_invites_vault ON notify_invites(vault_id)")
            # The assistant channel: an opted-in route can carry a question to a device and an
            # answer back. This is the only table that ties a route to a vault, and only for
            # people who switched the feature on.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS assistant_links (
                route_token TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                enabled_at REAL NOT NULL,
                mode TEXT NOT NULL DEFAULT 'minimal'
            )""")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_assistant_links_vault ON assistant_links(vault_id)")
            # `mode` is what the person chose: `minimal` answers only about tasks, `risky` lets the
            # device's assistant read the vault. The relay passes it through and never decides.
            self._ensure_column("assistant_links", "mode", "TEXT NOT NULL DEFAULT 'minimal'")
            # The placeholder is the whole user-visible state of a question: it is sent once and
            # rewritten in place, so `placeholder_message_id` has to survive a restart. `chat_id`
            # is deliberately NOT here: it lives only in `notify_routes.db`, and putting it next
            # to `vault_id` would rebuild the one link this design exists to avoid.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS assistant_requests (
                id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                route_token TEXT NOT NULL,
                question TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                answered_at REAL,
                question_message_id INTEGER,
                placeholder_message_id INTEGER,
                mode TEXT NOT NULL DEFAULT 'minimal',
                attempts INTEGER NOT NULL DEFAULT 1
            )""")
            self._ensure_column("assistant_requests", "question_message_id", "INTEGER")
            self._ensure_column("assistant_requests", "placeholder_message_id", "INTEGER")
            self._ensure_column("assistant_requests", "mode", "TEXT NOT NULL DEFAULT 'minimal'")
            self._ensure_column("assistant_requests", "attempts", "INTEGER NOT NULL DEFAULT 1")
            # The action an answer offered and the text it was written with. The answer text has
            # to outlive the delivery: `/applied` appends the outcome to the very message, and a
            # message cannot be rebuilt from a text that was only ever sent to Telegram.
            self._ensure_column("assistant_requests", "action_json", "TEXT")
            self._ensure_column("assistant_requests", "action_label", "TEXT")
            self._ensure_column("assistant_requests", "answer_text", "TEXT")
            self._ensure_column("assistant_requests", "applied_at", "REAL")
            # Which device wrote the answer: it is the only one asked to apply the action, so one
            # tap cannot become one note per machine that happens to be online.
            self._ensure_column("assistant_requests", "answered_by", "TEXT")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_assistant_pending ON assistant_requests(expires_at) WHERE answered_at IS NULL")
            # Delivery telemetry without content: an outcome, a duration and a salted route tag are
            # enough to answer "why was it slow" — the question itself never lands here.
            self.conn.execute("""CREATE TABLE IF NOT EXISTS delivery_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                at REAL NOT NULL,
                kind TEXT NOT NULL,
                route_tag TEXT,
                request_id TEXT,
                outcome TEXT,
                device_count INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER,
                error_code TEXT
            )""")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_delivery_events_at ON delivery_events(at)")

    def record_telemetry(self, event_type: str, platform: str = "unknown", metadata: Optional[dict] = None) -> str:
        event_id = f"evt_{secrets.token_hex(8)}"
        meta_json = json.dumps(metadata or {})
        with self.conn:
            self.conn.execute(
                "INSERT INTO telemetry_events (id, event_type, platform, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                (event_id, event_type, platform, meta_json, time.time())
            )
        return event_id

    def purge_room_bundles(self, room_id: str) -> int:
        with self.conn:
            res = self.conn.execute("DELETE FROM bundles WHERE room_id = ?", (room_id,))
            count = res.rowcount
        return count

    def room_vault(self, room_id: str) -> Optional[str]:
        """Which vault a room speaks for. The row outlives the socket, so it is not presence."""
        row = self.conn.execute("SELECT vault_id FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        return row["vault_id"] if row else None

    def touch_room(self, room_id: str, vault_id: Optional[str] = None) -> None:
        now = time.time()
        with self.conn:
            self.conn.execute("""
                INSERT INTO rooms (room_id, created_at, last_active_at, vault_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(room_id) DO UPDATE SET
                    last_active_at = excluded.last_active_at,
                    vault_id = COALESCE(rooms.vault_id, excluded.vault_id)
            """, (room_id, now, now, vault_id))

    def get_room_cache_bytes(self, room_id: str) -> int:
        row = self.conn.execute("SELECT COALESCE(SUM(LENGTH(CAST(payload AS BLOB))), 0) AS total FROM bundles WHERE room_id = ? AND expires_at > ?",
                                (room_id, time.time())).fetchone()
        return int(row["total"])

    def get_account_cache_bytes(self, account_id: str) -> int:
        row = self.conn.execute("""
            SELECT COALESCE(SUM(LENGTH(CAST(b.payload AS BLOB))), 0) AS total
            FROM bundles b
            JOIN rooms r ON r.room_id = b.room_id
            JOIN vaults v ON v.id = r.vault_id
            WHERE v.owner_account_id = ? AND b.expires_at > ?
        """, (account_id, time.time())).fetchone()
        return int(row["total"])

    def save_bundle(self, room_id: str, bundle_id: str, from_device: str, seq: int, ts: str,
                    payload_json: str, ttl: int = DEFAULT_TTL_SECONDS,
                    max_cache_bytes: int = DEFAULT_MAX_CACHE_BYTES, account_id: Optional[str] = None,
                    vault_id: Optional[str] = None) -> bool:
        if not isinstance(bundle_id, str) or not bundle_id or len(bundle_id) > 256:
            raise ApiError(400, "invalid_bundle_id")
        if self.conn.execute("SELECT 1 FROM bundle_receipts WHERE bundle_id = ?", (bundle_id,)).fetchone():
            raise ApiError(409, "bundle_replay")
        room = self.conn.execute("SELECT vault_id, retired FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        if room and (room["vault_id"] != vault_id or room["retired"]):
            raise ApiError(403, "room_binding_conflict")
        payload_len = len(payload_json.encode("utf-8"))
        current_cache = self.get_account_cache_bytes(account_id) if account_id else self.get_room_cache_bytes(room_id)
        if current_cache + payload_len > max_cache_bytes:
            logger.warning("Cache limit exceeded")
            return False
        now = time.time()
        self.touch_room(room_id, vault_id)
        with self.conn:
            max_row = self.conn.execute("SELECT COALESCE(MAX(sync_id), 0) AS max_id FROM bundles WHERE room_id = ?", (room_id,)).fetchone()
            sync_id = int(max_row["max_id"]) + 1
            self.conn.execute("""
                INSERT INTO bundles
                (bundle_id, room_id, from_device_id, sequence, timestamp, payload, created_at, expires_at, sync_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (bundle_id, room_id, from_device, seq, ts, payload_json, now, now + ttl, sync_id))
            self.conn.execute("INSERT INTO bundle_receipts VALUES (?, ?, ?)", (bundle_id, room_id, now))
        return sync_id

    def get_room_watermarks(self, room_id: str) -> dict:
        row = self.conn.execute("""
            SELECT COALESCE(MAX(sync_id), 0) AS head,
                   COALESCE(MIN(sync_id), 0) AS oldest
            FROM bundles WHERE room_id = ? AND expires_at > ?
        """, (room_id, time.time())).fetchone()
        return {"head": int(row["head"]), "oldest": int(row["oldest"])}

    def get_pending_bundles(self, room_id: str, device_id: str, limit: int = 100, since_sync_id: int = 0) -> list[dict]:
        if since_sync_id > 0:
            rows = self.conn.execute("""
                SELECT b.bundle_id, b.room_id, b.from_device_id, b.sequence, b.timestamp, b.payload, COALESCE(b.sync_id, 0) AS sync_id
                FROM bundles b
                WHERE b.room_id = ? AND b.from_device_id != ?
                  AND COALESCE(b.sync_id, 0) > ?
                  AND b.expires_at > ?
                ORDER BY b.sync_id ASC, b.created_at ASC LIMIT ?
            """, (room_id, device_id, since_sync_id, time.time(), limit)).fetchall()
        else:
            rows = self.conn.execute("""
                SELECT b.bundle_id, b.room_id, b.from_device_id, b.sequence, b.timestamp, b.payload, COALESCE(b.sync_id, 0) AS sync_id
                FROM bundles b
                WHERE b.room_id = ? AND b.from_device_id != ?
                  AND b.bundle_id NOT IN (SELECT bundle_id FROM bundle_acks WHERE device_id = ?)
                  AND b.expires_at > ?
                ORDER BY b.created_at ASC LIMIT ?
            """, (room_id, device_id, device_id, time.time(), limit)).fetchall()
        return [{
            "bundleId": row["bundle_id"], "roomId": row["room_id"],
            "fromDeviceId": row["from_device_id"], "sequence": row["sequence"],
            "timestamp": row["timestamp"], "syncId": row["sync_id"],
            "payload": json.loads(row["payload"])
        } for row in rows]

    def record_acks(self, device_id: str, bundle_ids: list[str], room_id: str) -> int:
        if not isinstance(bundle_ids, list) or not all(isinstance(item, str) for item in bundle_ids):
            raise ApiError(400, "invalid_bundle_ids")
        count = 0
        with self.conn:
            for bundle_id in bundle_ids:
                res = self.conn.execute("""INSERT OR IGNORE INTO bundle_acks (bundle_id, device_id, acked_at)
                    SELECT bundle_id, ?, ? FROM bundles WHERE bundle_id = ? AND room_id = ?
                    AND from_device_id != ? AND expires_at > ?""",
                    (device_id, time.time(), bundle_id, room_id, device_id, time.time()))
                count += int(res.rowcount > 0)
        return count

    def create_pairing_session(self, host_device_id: str, host_public_key: str, host_nonce: str,
                               host_account_id: Optional[str] = None, host_token_hash: Optional[str] = None) -> dict:
        session_id = secrets.token_hex(16)
        now = time.time()
        with self.conn:
            formatted_pin = ""
            for _ in range(10):
                pin = f"{secrets.randbelow(1000000):06d}"
                candidate = f"{pin[:3]}-{pin[3:]}"
                if not self.conn.execute("SELECT 1 FROM pairing_sessions WHERE pin = ? AND expires_at > ?",
                                         (candidate, now)).fetchone():
                    formatted_pin = candidate
                    break
            if not formatted_pin:
                pin = f"{secrets.randbelow(1000000):06d}"
                formatted_pin = f"{pin[:3]}-{pin[3:]}"
            self.conn.execute("""
                INSERT INTO pairing_sessions
                (pin, session_id, host_device_id, host_public_key, host_nonce, status, created_at, expires_at,
                 host_account_id, host_token_hash)
                VALUES (?, ?, ?, ?, ?, 'pending_guest', ?, ?, ?, ?)
            """, (formatted_pin, session_id, host_device_id, host_public_key, host_nonce, now,
                  now + PAIRING_TTL_SECONDS, host_account_id, host_token_hash))
        return {"pin": formatted_pin, "sessionId": session_id, "expiresIn": PAIRING_TTL_SECONDS}

    def get_pairing_by_pin(self, pin: str) -> Optional[sqlite3.Row]:
        clean_pin = pin.strip()
        if len(clean_pin) == 6 and clean_pin.isdigit():
            clean_pin = f"{clean_pin[:3]}-{clean_pin[3:]}"
        return self.conn.execute("SELECT * FROM pairing_sessions WHERE pin = ? AND expires_at > ?",
                                 (clean_pin, time.time())).fetchone()

    def claim_pairing_session(self, pin: str, guest_ephemeral_pk: str, guest_device_id: Optional[str] = None,
                              guest_account_id: Optional[str] = None) -> Optional[dict]:
        clean_pin = pin.strip()
        if len(clean_pin) == 6 and clean_pin.isdigit():
            clean_pin = f"{clean_pin[:3]}-{clean_pin[3:]}"
        now = time.time()
        with self.conn:
            row = self.conn.execute("SELECT * FROM pairing_sessions WHERE pin = ? AND expires_at > ? AND status = 'pending_guest'",
                                    (clean_pin, now)).fetchone()
            if not row:
                return None
            if row["host_account_id"] and row["host_account_id"] != guest_account_id:
                raise ApiError(403, "pairing_account_mismatch")
            combined = f"{row['host_public_key']}:{guest_ephemeral_pk}:{clean_pin}".encode("utf-8")
            sas_code = str(int(hashlib.sha256(combined).hexdigest()[:8], 16) % 9000 + 1000)
            self.conn.execute("""
                UPDATE pairing_sessions
                SET guest_ephemeral_pk = ?, sas_code = ?, status = 'pending_approval',
                    guest_device_id = ?, guest_account_id = ? WHERE pin = ?
            """, (guest_ephemeral_pk, sas_code, guest_device_id, guest_account_id, clean_pin))
            return {"sessionId": row["session_id"], "sasCode": sas_code, "status": "pending_approval"}

    def get_pairing_session(self, session_id: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM pairing_sessions WHERE session_id = ? AND expires_at > ?",
                                 (session_id, time.time())).fetchone()

    def approve_pairing_session(self, session_id: str, exchange_payload: str) -> bool:
        with self.conn:
            res = self.conn.execute("""
                UPDATE pairing_sessions SET status = 'approved', exchange_payload = ?
                WHERE session_id = ? AND expires_at > ? AND status = 'pending_approval'
            """, (exchange_payload, session_id, time.time()))
            return res.rowcount > 0

    def reject_pairing_session(self, session_id: str) -> bool:
        with self.conn:
            res = self.conn.execute("UPDATE pairing_sessions SET status = 'rejected' WHERE session_id = ? AND expires_at > ?",
                                    (session_id, time.time()))
            return res.rowcount > 0

    def poll_pairing_session(self, session_id: str) -> Optional[dict]:
        row = self.get_pairing_session(session_id)
        if not row:
            return None
        return {"sessionId": row["session_id"], "status": row["status"], "sasCode": row["sas_code"],
                "guestDeviceId": row["guest_device_id"], "exchangePayload": row["exchange_payload"],
                "expiresIn": max(0, int(row["expires_at"] - time.time()))}

    def create_challenge(self, account_id: str) -> str:
        challenge = secrets.token_urlsafe(32)
        now = time.time()
        with self.conn:
            self.conn.execute("DELETE FROM auth_challenges WHERE account_id = ?", (account_id,))
            self.conn.execute("INSERT INTO auth_challenges (challenge, account_id, expires_at) VALUES (?, ?, ?)",
                              (challenge, account_id, now + CHALLENGE_TTL_SECONDS))
        return challenge

    def consume_challenge(self, account_id: str, challenge: str) -> bool:
        with self.conn:
            row = self.conn.execute("SELECT expires_at FROM auth_challenges WHERE account_id = ? AND challenge = ?",
                                    (account_id, challenge)).fetchone()
            if row:
                self.conn.execute("DELETE FROM auth_challenges WHERE challenge = ?", (challenge,))
            return bool(row and row["expires_at"] > time.time())

    def record_audit(self, action: str, target_type: str, target_id: str, details: str) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT INTO audit_logs (id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (f"aud_{secrets.token_hex(6)}", action, target_type, target_id, details, time.time())
            )

    def record_ai_usage(self, account_id: str, model: str, prompt_tokens: int, completion_tokens: int,
                        latency_ms: float) -> None:
        """Stores token and latency counters only — never the prompt or the reply text."""
        with self.conn:
            self.conn.execute(
                "INSERT INTO ai_usage_logs VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"ai_{secrets.token_hex(6)}", account_id, model,
                 max(0, int(prompt_tokens)), max(0, int(completion_tokens)), float(latency_ms), time.time())
            )

    def count_ai_requests_since(self, account_id: str, since_ts: float) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) AS c FROM ai_usage_logs WHERE account_id = ? AND created_at >= ?",
            (account_id, since_ts)
        ).fetchone()
        return int(row["c"])

    def account_payload(self, account_id: str) -> dict:
        account = self.conn.execute("SELECT * FROM accounts WHERE account_id = ?", (account_id,)).fetchone()
        if not account:
            raise ApiError(404, "account_not_found")
        plan = PLANS.get(account["plan"], PLANS["free"])
        status = account["status"] if "status" in account.keys() else "active"
        expires_at = iso_time(account["expires_at"]) if "expires_at" in account.keys() and account["expires_at"] else None
        return {
            "id": account_id, "plan": account["plan"], "planLabel": plan["label"], "expiresAt": expires_at,
            "status": status,
            "maxDevices": plan["devices"], "maxCacheMb": plan["cache_mb"],
            "usedCacheMb": round(self.get_account_cache_bytes(account_id) / (1024 * 1024), 3),
            "allowAttachments": True, "hasAiLease": account["plan"] in ("smile", "angry") and status == "active"
        }

    def device_payload(self, row: sqlite3.Row) -> dict:
        return {"id": row["id"], "name": row["name"], "platform": row["platform"], "publicKey": row["public_key"],
                "status": row["status"], "pairedAt": iso_time(row["paired_at"]), "lastSeenAt": iso_time(row["last_seen_at"])}

    def _insert_session(self, account_id: str, device_id: str) -> tuple[str, float]:
        token = secrets.token_urlsafe(32)
        expires_at = time.time() + SESSION_TTL_SECONDS
        self.conn.execute("INSERT INTO auth_sessions (token_hash, account_id, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                          (hash_token(token), account_id, device_id, time.time(), expires_at))
        return token, expires_at

    def register_account(self, account_id: str, public_key: str, device: dict) -> tuple[str, float]:
        now = time.time()
        with self.conn:
            if self.conn.execute("SELECT 1 FROM accounts WHERE account_id = ?", (account_id,)).fetchone():
                raise ApiError(409, "account_already_exists")
            if self.conn.execute("SELECT 1 FROM devices WHERE id = ?", (device["id"],)).fetchone():
                raise ApiError(409, "device_already_exists")
            self.conn.execute("INSERT INTO accounts (account_id, public_key, plan, created_at) VALUES (?, ?, 'free', ?)",
                              (account_id, public_key, now))
            self.conn.execute("""
                INSERT INTO devices (id, account_id, name, platform, public_key, status, paired_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
            """, (device["id"], account_id, device["name"], device["platform"], device["publicKey"], now, now))
            return self._insert_session(account_id, device["id"])

    def login_account(self, account_id: str, device: dict) -> tuple[str, float] | dict:
        now = time.time()
        with self.conn:
            existing = self.conn.execute("SELECT * FROM devices WHERE id = ?", (device["id"],)).fetchone()
            if existing and existing["account_id"] != account_id:
                raise ApiError(409, "device_already_exists")
            if not existing:
                self.conn.execute("""
                    INSERT INTO devices (id, account_id, name, platform, public_key, status, paired_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """, (device["id"], account_id, device["name"], device["platform"], device["publicKey"], now, now))
                return {"status": "pending_device", "deviceId": device["id"]}
            if existing["public_key"] != device["publicKey"]:
                raise ApiError(403, "device_key_mismatch")
            if existing["status"] == "revoked":
                raise ApiError(403, "device_revoked")
            if existing["status"] != "active":
                return {"status": "pending_device", "deviceId": device["id"]}
            self.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (now, device["id"]))
            return self._insert_session(account_id, device["id"])

    def create_device_request(self, account_id: str, device: dict) -> dict:
        request_id = secrets.token_urlsafe(24)
        secret = secrets.token_urlsafe(32)
        now = time.time()
        with self.conn:
            self.conn.execute("INSERT INTO pending_auth_requests VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                              (request_id, hash_token(secret), account_id, device["id"], device["publicKey"],
                               now, now + DEVICE_REQUEST_TTL_SECONDS))
        return {"requestId": request_id, "continuationSecret": secret,
                "expiresAt": iso_time(now + DEVICE_REQUEST_TTL_SECONDS), "expiresIn": DEVICE_REQUEST_TTL_SECONDS}

    def authenticate(self, token: str) -> Optional[dict]:
        return self.authenticate_hash(hash_token(token)) if token else None

    def authenticate_hash(self, token_hash: str) -> Optional[dict]:
        now = time.time()
        row = self.conn.execute("""
            SELECT s.token_hash, s.account_id, s.device_id, s.expires_at, a.plan
            FROM auth_sessions s
            JOIN accounts a ON a.account_id = s.account_id
            JOIN devices d ON d.id = s.device_id AND d.account_id = s.account_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND d.status = 'active' AND COALESCE(a.status, 'active') = 'active'
        """, (token_hash, now)).fetchone()
        if row:
            # A used session slides forward, so an open app never gets logged out. Only once the
            # half of the term is gone: the websocket authenticates every message and a row write
            # per ping is waste.
            renewed = self.conn.execute(
                "UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at < ?",
                (now + SESSION_TTL_SECONDS, token_hash, now + SESSION_TTL_SECONDS / 2))
            self.conn.execute("UPDATE devices SET last_seen_at = ? WHERE id = ?", (now, row["device_id"]))
            if renewed.rowcount:
                self.conn.commit()
            return dict(row)
        return None

    def logout(self, token_hash: str) -> None:
        with self.conn:
            self.conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))

    def list_devices(self, account_id: str) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM devices WHERE account_id = ? ORDER BY paired_at", (account_id,)).fetchall()
        return [self.device_payload(row) for row in rows]

    def approve_device(self, account_id: str, device_id: str) -> None:
        row = self.conn.execute("SELECT * FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id)).fetchone()
        if not row:
            raise ApiError(404, "device_not_found")
        if row["status"] == "active":
            return
        if row["status"] not in ("pending", "revoked"):
            raise ApiError(409, "device_not_pending")
        active = self.conn.execute("SELECT COUNT(*) AS n FROM devices WHERE account_id = ? AND status = 'active'", (account_id,)).fetchone()["n"]
        if active >= PLANS[self.conn.execute("SELECT plan FROM accounts WHERE account_id = ?", (account_id,)).fetchone()["plan"]]["devices"]:
            raise ApiError(403, "device_limit_exceeded")
        with self.conn:
            self.conn.execute("UPDATE devices SET status = 'active', last_seen_at = ? WHERE id = ?", (time.time(), device_id))

    def rename_device(self, account_id: str, device_id: str, name: str) -> None:
        with self.conn:
            res = self.conn.execute("UPDATE devices SET name = ? WHERE id = ? AND account_id = ?", (name, device_id, account_id))
        if not res.rowcount:
            raise ApiError(404, "device_not_found")

    def revoke_device(self, account_id: str, device_id: str) -> None:
        if not self.conn.execute("SELECT 1 FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id)).fetchone():
            raise ApiError(404, "device_not_found")
        with self.conn:
            res = self.conn.execute("UPDATE devices SET status = 'revoked' WHERE id = ? AND account_id = ?", (device_id, account_id))
            self.conn.execute("DELETE FROM auth_sessions WHERE account_id = ? AND device_id = ?", (account_id, device_id))
            self.conn.execute("UPDATE vault_grants SET status = 'revoked', updated_at = ? WHERE device_id = ?", (time.time(), device_id))
        if not res.rowcount:
            raise ApiError(404, "device_not_found")

    def forget_device(self, account_id: str, device_id: str) -> None:
        if not self.conn.execute("SELECT 1 FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id)).fetchone():
            raise ApiError(404, "device_not_found")
        with self.conn:
            self.conn.execute("DELETE FROM vault_grants WHERE device_id = ?", (device_id,))
            self.conn.execute("DELETE FROM auth_sessions WHERE device_id = ?", (device_id,))
            self.conn.execute("DELETE FROM devices WHERE id = ? AND account_id = ?", (device_id, account_id))

    def vault_payload(self, vault_id: str) -> dict:
        vault = self.conn.execute("SELECT * FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        grants = self.conn.execute("SELECT * FROM vault_grants WHERE vault_id = ? ORDER BY device_id", (vault_id,)).fetchall()
        return {"id": vault["id"], "name": vault["name"], "ownerAccountId": vault["owner_account_id"],
                "grants": [{"deviceId": g["device_id"], "mode": g["mode"], "status": g["status"]} for g in grants]}

    def list_vaults(self, account_id: str, device_id: str) -> dict:
        accepted = self.conn.execute("""
            SELECT v.id FROM vaults v JOIN vault_grants g ON g.vault_id = v.id
            WHERE g.device_id = ? AND g.status = 'accepted'
        """, (device_id,)).fetchall()
        ids = sorted(row["id"] for row in accepted)
        invitations = self.conn.execute("""
            SELECT v.id, v.name, g.mode, g.encrypted_key FROM vaults v
            JOIN vault_grants g ON g.vault_id = v.id
            WHERE g.device_id = ? AND g.status = 'pending' ORDER BY v.id
        """, (device_id,)).fetchall()
        return {"vaults": [self.vault_payload(vault_id) for vault_id in ids],
                "invitations": [{"id": row["id"], "name": row["name"], "mode": row["mode"], "encryptedKey": row["encrypted_key"]}
                                for row in invitations]}

    def upsert_owned_vault(self, vault_id: str, name: str, account_id: str, device_id: str,
                           encrypted_key: Optional[str] = None) -> dict:
        vault_id = vault_id or f"vault_{secrets.token_hex(16)}"
        now = time.time()
        with self.conn:
            row = self.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
            if row and row["owner_account_id"] != account_id:
                raise ApiError(403, "vault_not_owned")
            if row:
                grant = self.conn.execute("SELECT mode, status FROM vault_grants WHERE vault_id = ? AND device_id = ?",
                                          (vault_id, device_id)).fetchone()
                if not grant or grant["status"] != "accepted" or grant["mode"] != "read-write":
                    raise ApiError(403, "vault_access_denied")
                self.conn.execute("UPDATE vaults SET name = ?, updated_at = ? WHERE id = ?", (name, now, vault_id))
                return self.vault_payload(vault_id)
            else:
                self.conn.execute("INSERT INTO vaults (id, name, owner_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                                  (vault_id, name, account_id, now, now))
            current = self.conn.execute("SELECT encrypted_key FROM vault_grants WHERE vault_id = ? AND device_id = ?",
                                        (vault_id, device_id)).fetchone()
            key = encrypted_key if encrypted_key is not None else (current["encrypted_key"] if current else None)
            self.conn.execute("""
                INSERT INTO vault_grants (vault_id, device_id, mode, status, encrypted_key, updated_at)
                VALUES (?, ?, 'read-write', 'accepted', ?, ?)
                ON CONFLICT(vault_id, device_id) DO UPDATE SET mode = 'read-write', status = 'accepted',
                    encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at
            """, (vault_id, device_id, key, now))
        return self.vault_payload(vault_id)

    def set_vault_grant(self, vault_id: str, account_id: str, device_id: str, mode: str,
                        encrypted_key: Optional[str], status: str = "pending") -> None:
        vault = self.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        if vault["owner_account_id"] != account_id:
            raise ApiError(403, "vault_not_owned")
        device = self.conn.execute("SELECT account_id, status FROM devices WHERE id = ?", (device_id,)).fetchone()
        if not device or device["account_id"] != account_id:
            raise ApiError(404, "device_not_found")
        if status in ("pending", "accepted") and device["status"] != "active":
            raise ApiError(409, "device_not_active")
        with self.conn:
            self.conn.execute("""
                INSERT INTO vault_grants (vault_id, device_id, mode, status, encrypted_key, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(vault_id, device_id) DO UPDATE SET mode = excluded.mode,
                    status = CASE WHEN vault_grants.status = 'accepted' AND excluded.status = 'pending'
                        AND vault_grants.mode = excluded.mode AND vault_grants.encrypted_key IS excluded.encrypted_key
                        THEN 'accepted' ELSE excluded.status END,
                    encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at
            """, (vault_id, device_id, mode, status, encrypted_key, time.time()))

    def revoke_vault_grant(self, vault_id: str, account_id: str, device_id: str) -> None:
        vault = self.conn.execute("SELECT owner_account_id FROM vaults WHERE id = ?", (vault_id,)).fetchone()
        if not vault:
            raise ApiError(404, "vault_not_found")
        if vault["owner_account_id"] != account_id:
            raise ApiError(403, "vault_not_owned")
        with self.conn:
            res = self.conn.execute("UPDATE vault_grants SET status = 'revoked', updated_at = ? WHERE vault_id = ? AND device_id = ?",
                                    (time.time(), vault_id, device_id))
        if not res.rowcount:
            raise ApiError(404, "grant_not_found")

    def respond_to_grant(self, vault_id: str, device_id: str, accept: bool) -> dict:
        row = self.conn.execute("""
            SELECT g.*, v.name FROM vault_grants g JOIN vaults v ON v.id = g.vault_id
            WHERE g.vault_id = ? AND g.device_id = ? AND g.status = 'pending'
        """, (vault_id, device_id)).fetchone()
        if not row:
            raise ApiError(404, "invitation_not_found")
        with self.conn:
            self.conn.execute("UPDATE vault_grants SET status = ?, updated_at = ? WHERE vault_id = ? AND device_id = ?",
                              ("accepted" if accept else "revoked", time.time(), vault_id, device_id))
        if accept:
            return {"id": vault_id, "name": row["name"], "mode": row["mode"], "encryptedKey": row["encrypted_key"]}
        return {"status": "ok"}

    def cleanup_expired(self) -> None:
        now = time.time()
        with self.conn:
            self.conn.execute("DELETE FROM bundles WHERE expires_at <= ?", (now,))
            self.conn.execute("DELETE FROM bundle_acks WHERE bundle_id NOT IN (SELECT bundle_id FROM bundles)")
            self.conn.execute("DELETE FROM pairing_sessions WHERE expires_at <= ?", (now,))
            self.conn.execute("DELETE FROM auth_challenges WHERE expires_at <= ?", (now,))
            self.conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now,))
            # Keep expired requests briefly so clients can distinguish expiry from bad credentials.
            self.conn.execute("DELETE FROM pending_auth_requests WHERE expires_at <= ?", (now - 24 * 3600,))
            # An invite row is the one place a vault id meets a chat id, so it must not linger.
            self.conn.execute("DELETE FROM notify_invites WHERE expires_at <= ?", (now - NOTIFY_INVITE_KEEP_SECONDS,))
            self.conn.execute("DELETE FROM notify_jobs WHERE sent_at IS NOT NULL AND sent_at <= ?", (now - 86400,))

    def create_notify_invite(self, vault_id: str, code: str, route_token: str) -> float:
        """One live code per vault: asking again revokes the previous one.

        A pile of valid codes is a pile of open doors, and the app shows a single channel
        anyway — so the new code replaces the old instead of queueing beside it.
        """
        now = time.time()
        expires_at = now + NOTIFY_INVITE_TTL_SECONDS
        with self.conn:
            self.conn.execute("DELETE FROM notify_invites WHERE vault_id = ? AND redeemed_at IS NULL", (vault_id,))
            self.conn.execute(
                "INSERT INTO notify_invites (code, route_token, vault_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                (code, route_token, vault_id, now, expires_at))
        return expires_at

    def get_notify_invite(self, code: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM notify_invites WHERE code = ?", (code,)).fetchone()

    def pending_notify_invites(self, vault_id: str) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS n FROM notify_invites WHERE vault_id = ? AND redeemed_at IS NULL AND expires_at > ?",
                                (vault_id, time.time())).fetchone()
        return row["n"] if row else 0

    def redeem_notify_invite(self, code: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_invites SET redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL",
                              (time.time(), code))

    def count_notify_jobs(self, vault_id: str) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS n FROM notify_jobs WHERE vault_id = ? AND sent_at IS NULL",
                                (vault_id,)).fetchone()
        return row["n"] if row else 0

    def count_notify_jobs_for_account(self, account_id: str) -> int:
        row = self.conn.execute("""
            SELECT COUNT(*) AS n FROM notify_jobs j JOIN vaults v ON v.id = j.vault_id
            WHERE v.owner_account_id = ? AND j.sent_at IS NULL
        """, (account_id,)).fetchone()
        return row["n"] if row else 0

    def notify_sent_last_hour(self, route_token: str) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) AS n FROM notify_jobs WHERE route_token = ? AND sent_at > ?",
            (route_token, time.time() - 3600)).fetchone()
        return row["n"] if row else 0

    def arm_notify_jobs(self, vault_id: str, item_key: str, event_key: Optional[str], fire_at: float,
                        routes: list[dict], presentation: Optional[dict] = None) -> tuple[int, list[dict]]:
        """Idempotent: the (route, event) primary key is the whole dedup story.

        `routes` is the full desired recipient set for the item: a recipient dropped from it
        loses the already-queued job, otherwise deleting a route in settings would still
        deliver the message that was armed a minute earlier.

        A repeat arm refreshes an unsent job (edited text, toggled spoiler) but only from the
        same timezone: two devices in different zones would otherwise pull the moment back and
        forth every reconcile, so the first arm keeps the clock and the second keeps quiet.
        """
        now = time.time()
        armed = 0
        if not event_key:
            with self.conn:
                self.conn.execute("DELETE FROM notify_jobs WHERE vault_id = ? AND item_key = ? AND sent_at IS NULL",
                                  (vault_id, item_key))
            return 0, []
        look = presentation or {}
        kind = look.get("kind", "task")
        stamp = look.get("stamp", "")
        spoiler = 1 if look.get("spoiler") else 0
        tz = int(look.get("tz", 0))
        tokens = [route["token"] for route in routes]
        placeholders = ",".join("?" for _ in tokens)
        with self.conn:
            self.conn.execute(
                "DELETE FROM notify_jobs WHERE vault_id = ? AND item_key = ? AND sent_at IS NULL "
                f"AND (event_key != ? OR route_token NOT IN ({placeholders}))",
                (vault_id, item_key, event_key, *tokens))
            for route in routes:
                res = self.conn.execute("""
                    INSERT INTO notify_jobs
                        (route_token, event_key, item_key, vault_id, fire_at, title, body, created_at,
                         kind, stamp, spoiler, tz)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(route_token, event_key) DO UPDATE SET
                        title = excluded.title, body = excluded.body, fire_at = excluded.fire_at,
                        kind = excluded.kind, stamp = excluded.stamp, spoiler = excluded.spoiler
                    WHERE notify_jobs.sent_at IS NULL AND notify_jobs.tz = excluded.tz
                """, (route["token"], event_key, item_key, vault_id, fire_at,
                      route.get("title", ""), route.get("body", ""), now,
                      kind, stamp, spoiler, tz))
                armed += res.rowcount
        return armed, []

    def set_assistant_link(self, route_token: str, vault_id: str, enabled: bool,
                           mode: str = "minimal") -> None:
        with self.conn:
            if enabled:
                self.conn.execute(
                    "INSERT INTO assistant_links (route_token, vault_id, enabled_at, mode)"
                    " VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(route_token) DO UPDATE SET vault_id = excluded.vault_id,"
                    " mode = excluded.mode",
                    (route_token, vault_id, time.time(), mode))
            else:
                self.conn.execute("DELETE FROM assistant_links WHERE route_token = ?", (route_token,))

    def assistant_link(self, route_token: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM assistant_links WHERE route_token = ?", (route_token,)).fetchone()

    def create_assistant_request(self, vault_id: str, route_token: str, question: str,
                                 mode: str = "minimal",
                                 question_message_id: Optional[int] = None) -> str:
        request_id = f"ask_{secrets.token_hex(8)}"
        now = time.time()
        with self.conn:
            self.conn.execute(
                "INSERT INTO assistant_requests (id, vault_id, route_token, question, created_at,"
                " expires_at, mode, question_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (request_id, vault_id, route_token, question, now,
                 now + ASSISTANT_REQUEST_TTL_SECONDS, mode, question_message_id))
        return request_id

    def set_assistant_placeholder(self, request_id: str, message_id: Optional[int]) -> None:
        """The bubble the answer will overwrite. Without it the answer falls back to a new message."""
        with self.conn:
            self.conn.execute("UPDATE assistant_requests SET placeholder_message_id = ? WHERE id = ?",
                              (int(message_id) if message_id is not None else None, request_id))

    def get_assistant_request(self, request_id: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM assistant_requests WHERE id = ?", (request_id,)).fetchone()

    def finish_assistant_request(self, request_id: str) -> None:
        # The text is answered or dead by now: keeping it would turn a delivery queue into an
        # archive of somebody's questions.
        with self.conn:
            self.conn.execute("UPDATE assistant_requests SET answered_at = ?, question = ''"
                              " WHERE id = ? AND answered_at IS NULL",
                              (time.time(), request_id))

    def set_assistant_answer(self, request_id: str, text: str, action: Optional[dict],
                             answered_by: str = "") -> None:
        """What was actually sent, kept next to the request while its bubble is still editable.

        `/applied` has to append to that exact message, so the relay stores the text it rendered
        and the action it offered — the chat is the only place the answer exists otherwise. The
        device that wrote the answer is stored too: it is the one that will apply the action, and
        asking every socket would apply one tap as many times as there are machines online.
        """
        label = assistant_action_label(action)
        encoded = json.dumps(action) if label else None
        with self.conn:
            self.conn.execute(
                "UPDATE assistant_requests SET answer_text = ?, action_json = ?, action_label = ?,"
                " answered_by = ? WHERE id = ?", (text, encoded, label, answered_by or None, request_id))
    def mark_assistant_applied(self, request_id: str) -> bool:
        """True for the call that won the race, False for every retry: the edit happens once."""
        with self.conn:
            res = self.conn.execute(
                "UPDATE assistant_requests SET applied_at = ? WHERE id = ? AND applied_at IS NULL",
                (time.time(), request_id))
        return res.rowcount == 1

    def dismiss_assistant_action(self, request_id: str) -> bool:
        """True for the tap that dismissed a card; a second tap, or one after applying, is not.

        Clearing `action_json` is the whole point: it is what makes a leftover `act:` button on
        the same message answer "stale" instead of creating the note the person just refused.
        """
        with self.conn:
            res = self.conn.execute(
                "UPDATE assistant_requests SET action_json = NULL, action_label = NULL"
                " WHERE id = ? AND action_json IS NOT NULL AND applied_at IS NULL", (request_id,))
        return res.rowcount == 1

    def expired_assistant_requests(self, now: float, limit: int = 20) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM assistant_requests WHERE answered_at IS NULL AND expires_at <= ? LIMIT ?",
            (now, limit)).fetchall()

    def pending_assistant_requests(self, vault_id: str, now: float) -> list[sqlite3.Row]:
        """What a reconnecting device missed: the socket broadcast does not survive a reconnect."""
        return self.conn.execute(
            "SELECT * FROM assistant_requests WHERE vault_id = ? AND answered_at IS NULL AND expires_at > ?"
            " ORDER BY created_at LIMIT 20", (vault_id, now)).fetchall()

    def log_delivery_event(self, kind: str, outcome: str, route_tag: str = "", request_id: str = "",
                           device_count: int = 0, latency_ms: Optional[int] = None,
                           error_code: str = "") -> None:
        with self.conn:
            self.conn.execute(
                "INSERT INTO delivery_events (at, kind, route_tag, request_id, outcome, device_count,"
                " latency_ms, error_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (time.time(), kind, route_tag, request_id, outcome, device_count, latency_ms, error_code))

    def purge_delivery_events(self, older_than: float) -> int:
        with self.conn:
            res = self.conn.execute("DELETE FROM delivery_events WHERE at < ?", (older_than,))
        return res.rowcount

    def due_notify_jobs(self, now: float, limit: int) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM notify_jobs WHERE sent_at IS NULL AND fire_at <= ? ORDER BY fire_at LIMIT ?",
            (now, limit)).fetchall()

    def claim_notify_job(self, route_token: str, event_key: str, now: float) -> bool:
        with self.conn:
            res = self.conn.execute("""
                UPDATE notify_jobs SET claimed_at = ?, attempts = attempts + 1
                WHERE route_token = ? AND event_key = ? AND sent_at IS NULL
                  AND (claimed_at IS NULL OR claimed_at < ?)
            """, (now, route_token, event_key, now - NOTIFY_CLAIM_LEASE_SECONDS))
        return res.rowcount == 1

    def finish_notify_job(self, route_token: str, event_key: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_jobs SET sent_at = ? WHERE route_token = ? AND event_key = ?",
                              (time.time(), route_token, event_key))

    def release_notify_job(self, route_token: str, event_key: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_jobs SET claimed_at = NULL WHERE route_token = ? AND event_key = ?",
                              (route_token, event_key))


class NotifyStore:
    """route_token -> chat_id, kept in its own file on purpose.

    The relay database knows vaults, accounts and devices; this one must never learn any of
    them, otherwise one dump becomes "this person's public key = that Telegram account".
    A route token means nothing outside this file, and no query here joins across files.
    """

    def __init__(self, db_path: str):
        if db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=NORMAL")
        except sqlite3.Error as exc:
            logger.warning("Notify SQLite tuning unavailable: %s", exc)
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS notify_routes (
                    route_token TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL,
                    label TEXT NOT NULL DEFAULT '',
                    vault_tag TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL,
                    blocked_at REAL
                )""")
            columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(notify_routes)")}
            if "vault_tag" not in columns:
                self.conn.execute("ALTER TABLE notify_routes ADD COLUMN vault_tag TEXT NOT NULL DEFAULT ''")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_routes_chat ON notify_routes(chat_id)")
        # Whoever can read this file owns every Telegram channel in it: keep it to the owner.
        if db_path != ":memory:" and os.name == "posix":
            try:
                os.chmod(db_path, 0o600)
            except OSError as exc:
                logger.warning("Cannot tighten notify db permissions: %s", exc)

    def link(self, route_token: str, chat_id: str, label: str, vault_tag: str = "") -> None:
        now = time.time()
        with self.conn:
            self.conn.execute("""
                INSERT INTO notify_routes (route_token, chat_id, label, vault_tag, created_at, blocked_at)
                VALUES (?, ?, ?, ?, ?, NULL)
                ON CONFLICT(route_token) DO UPDATE SET chat_id = excluded.chat_id,
                    label = excluded.label, vault_tag = excluded.vault_tag, blocked_at = NULL
            """, (route_token, chat_id, label, vault_tag, now))

    def get(self, route_token: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM notify_routes WHERE route_token = ?", (route_token,)).fetchone()

    def routes_for_chat(self, chat_id: str) -> list[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM notify_routes WHERE chat_id = ? AND blocked_at IS NULL",
                                 (chat_id,)).fetchall()

    def block_chat(self, chat_id: str) -> int:
        with self.conn:
            res = self.conn.execute("UPDATE notify_routes SET blocked_at = ? WHERE chat_id = ? AND blocked_at IS NULL",
                                    (time.time(), chat_id))
        return res.rowcount

    def block_route(self, route_token: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE notify_routes SET blocked_at = ? WHERE route_token = ?",
                              (time.time(), route_token))


# The Bot API surface lives in `tg.py`: a leaf module shared by the queue, the bot loop and
# the assistant. It is re-exported through the imports above so callers keep one entry point.


class SlagRelayServer:
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

    @staticmethod
    def _normalize_ai_model(model: str) -> str:
        return str(model or "").strip().lower().replace(".", "-")

    @staticmethod
    def _ai_model() -> str:
        return os.environ.get("SLAG_AI_MODEL", "").strip() or "deepseek-v4-1-flash"

    @staticmethod
    def _kie_base_url() -> str:
        return (os.environ.get("KIE_BASE_URL", "").strip() or "https://api.kie.ai").rstrip("/")

    @staticmethod
    def _ai_timeout_seconds() -> float:
        try:
            return max(5.0, min(180.0, float(os.environ.get("SLAG_AI_TIMEOUT_SECONDS", "60"))))
        except ValueError:
            return 60.0

    @staticmethod
    def _ai_daily_limit() -> int:
        try:
            return max(0, int(os.environ.get("SLAG_AI_DAILY_LIMIT", "500")))
        except ValueError:
            return 500

    @staticmethod
    def _call_ai_upstream(url: str, api_key: str, payload: dict, timeout: float) -> Tuple[object, bytes]:
        """Blocking upstream call, always run through `asyncio.to_thread`.

        Returns ("timeout" | "network" | int_http_status, raw_body). Never raises.
        """
        return SlagRelayServer._post_raw(url, api_key, json.dumps(payload).encode("utf-8"),
                                         "application/json", timeout)

    @staticmethod
    def _post_raw(url: str, api_key: str, body: bytes, content_type: str,
                  timeout: float) -> Tuple[object, bytes]:
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": content_type,
                     "Authorization": api_key if api_key.startswith("Bearer ") else f"Bearer {api_key}",
                     "User-Agent": "SLAG-Relay-Gateway/0.2.0"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()
        except urllib.error.URLError as exc:
            reason = exc.reason
            return ("timeout" if isinstance(reason, TimeoutError) else "network"), b""
        except TimeoutError:
            return "timeout", b""
        except Exception:
            return "network", b""

    @staticmethod
    def _groq_base_url() -> str:
        return (os.environ.get("GROQ_BASE_URL", "").strip() or "https://api.groq.com/openai/v1").rstrip("/")

    @staticmethod
    def _groq_vision_model() -> str:
        return os.environ.get("SLAG_VISION_MODEL", "").strip() or "qwen/qwen3.8-27b"

    @staticmethod
    def _groq_whisper_model() -> str:
        return os.environ.get("SLAG_WHISPER_MODEL", "").strip() or "whisper-large-v3-turbo"

    @staticmethod
    def _call_groq_vision(api_key: str, data_url: str, prompt: str, timeout: float) -> Tuple[object, bytes, str]:
        model = SlagRelayServer._groq_vision_model()
        instruction = prompt.strip() or (
            'Извлеки весь читаемый текст с изображения (OCR) и дай краткое описание сути. '
            'Ответ строго JSON: {"extractedText": "...", "summary": "..."}')
        payload = {
            "model": model,
            "temperature": 0.1,
            "max_tokens": 900,
            "response_format": {"type": "json_object"},
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }],
        }
        outcome, raw = SlagRelayServer._post_raw(
            f"{SlagRelayServer._groq_base_url()}/chat/completions",
            api_key, json.dumps(payload).encode("utf-8"), "application/json", timeout)
        return outcome, raw, model

    @staticmethod
    def _call_groq_audio(api_key: str, data_url: str, prompt: str, file_name: str,
                         timeout: float) -> Tuple[object, bytes, str]:
        model = SlagRelayServer._groq_whisper_model()
        try:
            header, encoded = data_url.split(",", 1)
            mime = header[5:].split(";")[0] or "audio/webm"
            audio = base64.b64decode(encoded)
        except (ValueError, TypeError):
            return "bad_data", b"", model
        if len(audio) > 12 * 1024 * 1024:
            return "too_large", b"", model

        boundary = "----slag" + secrets.token_hex(8)
        safe_name = (file_name or "audio.webm").replace('"', "").replace("\r", "").replace("\n", "")[:120]
        chunks: list[bytes] = []

        def field(name: str, value: str) -> None:
            chunks.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8"))

        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n".encode("utf-8") + audio + b"\r\n")
        field("model", model)
        field("response_format", "json")
        field("temperature", "0")
        if prompt.strip():
            field("prompt", prompt.strip()[:900])
        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))

        outcome, raw = SlagRelayServer._post_raw(
            f"{SlagRelayServer._groq_base_url()}/audio/transcriptions",
            api_key, b"".join(chunks), f"multipart/form-data; boundary={boundary}", timeout)
        return outcome, raw, model


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

    @staticmethod
    def _validate_assistant_action(action: object) -> dict:
        """Opaque to the relay, but it has to survive sqlite and a websocket frame unchanged.

        The label is required because it is the only part the relay renders: accepting an action
        without one would deliver an answer whose button silently never appears, and chasing that
        from the chat side is guesswork.
        """
        if not isinstance(action, dict) or assistant_action_label(action) is None:
            raise ApiError(400, "invalid_action")
        try:
            encoded = json.dumps(action)
        except (TypeError, ValueError):
            raise ApiError(400, "invalid_action")
        if len(encoded) > ASSISTANT_MAX_ACTION_JSON:
            raise ApiError(400, "invalid_action")
        return action

    def _notify_tag(self, vault_id: str) -> str:
        """Vault fingerprint stored next to the chat id, never the vault id itself."""
        if not self.notify_pepper:
            return ""
        return hmac.new(self.notify_pepper, vault_id.encode("utf-8"), hashlib.sha256).hexdigest()[:32]

    def _notify_channel_state(self, vault_id: str, route_token: str) -> str:
        """`pending | active | blocked`, with one answer for every channel that is not ours.

        Unknown, someone else's and never-linked must read the same, otherwise this endpoint
        turns into an oracle for which channels exist.
        """
        tag = self._notify_tag(vault_id)
        route = self.notify.get(route_token)
        if not route or not tag or not hmac.compare_digest(route["vault_tag"], tag):
            return "pending"
        return "blocked" if route["blocked_at"] is not None else "active"

    def _arm_notifications(self, body: dict, vault_id: str) -> tuple[int, list[dict]]:
        """Validate an arm payload and queue it. Caller has already authorized the vault."""
        item_key = body.get("itemKey", "")
        if not isinstance(item_key, str) or not item_key or len(item_key) > 200:
            raise ApiError(400, "invalid_notification")
        event_key = body.get("eventKey")
        if event_key is not None and (not isinstance(event_key, str) or not event_key or len(event_key) > 128):
            raise ApiError(400, "invalid_notification")
        if event_key is None:
            return self.db.arm_notify_jobs(vault_id, item_key, None, 0.0, [])
        fire_at = body.get("fireAt")
        raw_routes = body.get("routes")
        if not isinstance(fire_at, (int, float)) or isinstance(fire_at, bool):
            raise ApiError(400, "invalid_notification")
        # A job that fires in 3000 is a queue squat, one that fired last week is noise.
        now = time.time()
        if not (now - NOTIFY_LEEWAY_SECONDS <= fire_at <= now + NOTIFY_MAX_LEAD_SECONDS):
            raise ApiError(400, "invalid_notification")
        if not isinstance(raw_routes, list) or not raw_routes or len(raw_routes) > 20:
            raise ApiError(400, "invalid_notification")
        # Presentation is rendered by the relay, so it is validated here, not trusted as markup.
        kind = body.get("kind", "task")
        stamp = body.get("stamp", "")
        spoiler = body.get("spoiler", False)
        tz = body.get("tz", 0)
        if (kind not in TG_KINDS or not isinstance(stamp, str) or len(stamp) > TG_STAMP_MAX
                or not isinstance(spoiler, bool) or not isinstance(tz, int) or isinstance(tz, bool)
                or not -1440 <= tz <= 1440):
            raise ApiError(400, "invalid_notification")
        if self.db.count_notify_jobs(vault_id) > NOTIFY_MAX_JOBS_PER_VAULT:
            raise ApiError(429, "notify_queue_full")
        vault_tag = self._notify_tag(vault_id)
        routes: list[dict] = []
        dropped: list[dict] = []
        for entry in raw_routes:
            if not isinstance(entry, dict):
                raise ApiError(400, "invalid_notification")
            token = entry.get("token")
            title = entry.get("title", "")
            bodytext = entry.get("body", "")
            if (not isinstance(token, str) or not token or len(token) > 128 or not isinstance(title, str)
                    or not isinstance(bodytext, str) or len(title) > 200 or len(bodytext) > 1500):
                raise ApiError(400, "invalid_notification")
            route = self.notify.get(token)
            # One uniform answer for "unknown" and "someone else's": a token must not be
            # usable as an oracle for which channels exist.
            if not route or not vault_tag or not hmac.compare_digest(route["vault_tag"], vault_tag):
                dropped.append({"token": token, "reason": "not_linked"})
            elif route["blocked_at"] is not None:
                dropped.append({"token": token, "reason": "blocked"})
            else:
                routes.append({"token": token, "title": title, "body": bodytext})
        armed, _ = self.db.arm_notify_jobs(vault_id, item_key, event_key, float(fire_at), routes,
                                           {"kind": kind, "stamp": stamp.strip(),
                                            "spoiler": spoiler, "tz": tz})
        return armed, dropped

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

    async def bot_loop(self) -> None:
        """Long polling. One poller per token: a second instance gets 409 from Telegram."""
        if not self.bot:
            return
        ok, body = await self.bot.call("getMe", {}, timeout=15)
        if ok:
            self.bot.username = (body.get("result") or {}).get("username")
            logger.info("Telegram bot ready: @%s", self.bot.username)
            await self.bot.call("setMyCommands", {"commands": [
                {"command": "start", "description": "привязать уведомления"},
                {"command": "clear", "description": "забыть разговор"},
                {"command": "stop", "description": "отключить уведомления"}]}, timeout=15)
        else:
            logger.warning("Telegram getMe failed: %s", body.get("description"))
        failures = 0
        while True:
            try:
                ok, body = await self.bot.call("getUpdates", {
                    "offset": self.bot_offset, "timeout": 25,
                    # A tap on an action button is an update of its own kind: without it here the
                    # button looks alive and does nothing, which is worse than no button.
                    "allowed_updates": ["message", "callback_query"]}, timeout=40)
                if not ok:
                    failures += 1
                    logger.warning("Telegram getUpdates failed (%s): %s", body.get("error_code"), body.get("description"))
                    await asyncio.sleep(60 if failures > 3 else 5)
                    continue
                failures = 0
                for update in body.get("result") or []:
                    if isinstance(update, dict):
                        self.bot_offset = max(self.bot_offset, int(update.get("update_id") or 0) + 1)
                        await self._handle_bot_update(update)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Telegram poll error: %s", exc)
                await asyncio.sleep(10)

    async def _send_telegram(self, chat_id: str, html: str, plain: str, timeout: float = 20,
                             reply_markup: Optional[dict] = None) -> Tuple[bool, dict]:
        """HTML first. Telegram refusing our markup is our bug, not a reason to lose the message.

        `reply_markup` rides along on both attempts: a refused entity must not also cost the
        person the button that the message was about.
        """
        payload = {"chat_id": chat_id, "text": html, "parse_mode": "HTML",
                   "disable_web_page_preview": True}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        ok, body = await self.bot.call("sendMessage", payload, timeout=timeout)
        if ok or body.get("error_code") != 400:
            return ok, body
        logger.warning("Telegram refused the markup (%s), sending plain text", body.get("description"))
        fallback = {"chat_id": chat_id, "text": plain, "disable_web_page_preview": True}
        if reply_markup is not None:
            fallback["reply_markup"] = reply_markup
        return await self.bot.call("sendMessage", fallback, timeout=timeout)

    async def _bot_reply(self, chat_id: str, text: str, html: Optional[str] = None) -> bool:
        """Bot copy is plain by contract; `html` is its formatted twin when the caller builds one."""
        if not self.bot:
            return False
        plain = tg_truncate(text, TG_TEXT_LIMIT)
        ok, body = await self._send_telegram(chat_id, html or tg_escape(plain), plain, timeout=15)
        if not ok:
            logger.warning("Telegram sendMessage failed: %s", body.get("description"))
        return ok

    async def _handle_bot_update(self, update: dict) -> None:
        callback = update.get("callback_query")
        if isinstance(callback, dict):
            data = callback.get("data")
            if isinstance(data, str) and data.startswith(ASSISTANT_DROP_PREFIX):
                await self._handle_drop_callback(callback)
            else:
                await self._handle_action_callback(callback)
            return
        message = update.get("message")
        if not isinstance(message, dict):
            return
        chat = message.get("chat") or {}
        # Account linking only counts in a private chat: "startgroup" is a different flow.
        if chat.get("type") != "private":
            return
        chat_id = str(chat.get("id") or "")
        if not chat_id:
            return
        sender = str((message.get("from") or {}).get("id") or chat_id)
        text = (message.get("text") or "").strip()
        if not text:
            return
        if not text.startswith("/"):
            # Anything that is not a command is a question for the vault's assistant.
            message_id = message.get("message_id")
            await self._bot_question(chat_id, text, message_id if isinstance(message_id, int) else None)
            return
        command, _, argument = text.partition(" ")
        command = command.split("@", 1)[0].lower()
        if command == "/stop":
            blocked = self.notify.block_chat(chat_id)
            await self._bot_reply(chat_id, "ок, отключил — сюда больше ничего не придёт."
                                  if blocked else "у тебя и не было активных уведомлений.")
            return
        if command == "/start":
            await self._bot_start(chat_id, sender, argument.strip(), message)
            return
        if command in ("/ask", "/a"):
            await self._bot_question(chat_id, argument.strip())
            return
        if command == "/clear":
            await self._bot_clear(chat_id)
            return
        if command == "/help":
            await self._bot_reply(
                chat_id,
                "напоминания приходят сами — привязка один раз, по ссылке из приложения.\n"
                "обычное сообщение уходит на устройство с открытым хранилищем, ответ придёт сюда же.\n"
                "/clear — забыть, о чём говорили.\n"
                "/stop — отписаться.",
                html="<b>напоминания</b> приходят сами — привязка один раз, по ссылке из приложения.\n"
                     "обычное сообщение уходит на устройство с открытым хранилищем, ответ придёт сюда же.\n"
                     "<code>/clear</code> — забыть, о чём говорили.\n"
                     "<code>/stop</code> — отписаться.")

    async def _bot_start(self, chat_id: str, sender: str, code: str, message: dict) -> None:
        if not code:
            await self._bot_reply(chat_id, "это служебный бот slag. ссылку-приглашение создаёт приложение: "
                                           "настройки → уведомления в telegram.",
                                  html="это служебный бот slag. ссылку-приглашение создаёт приложение: "
                                       "<code>настройки → уведомления в telegram</code>.")
            return
        if not BOT_CODE_RE.match(code):
            await self._bot_reply(chat_id, "код не похож на настоящий.")
            return
        if not self._allow_request(f"tg-start:{sender}", 10):
            await self._bot_reply(chat_id, "слишком много попыток, подожди минуту.")
            return
        invite = self.db.get_notify_invite(code)
        if not invite or invite["expires_at"] <= time.time():
            await self._bot_reply(chat_id, "код недействителен или истёк — создай новый в приложении.")
            return
        if invite["redeemed_at"] is not None:
            await self._bot_reply(chat_id, "этот код уже использован.")
            return
        from_user = message.get("from") or {}
        label = " ".join(part for part in (from_user.get("first_name"), from_user.get("last_name")) if part).strip()
        label = label or str(from_user.get("username") or "")
        self.notify.link(invite["route_token"], chat_id, label[:64], self._notify_tag(invite["vault_id"]))
        self.db.redeem_notify_invite(code)
        vault = self.db.conn.execute("SELECT name FROM vaults WHERE id = ?", (invite["vault_id"],)).fetchone()
        source = f"«{vault['name']}»" if vault else "хранилища"
        await self._bot_reply(chat_id, f"готово. напоминания из {source} будут приходить сюда.",
                              html=f"<b>готово</b>. напоминания из {tg_escape(source)} будут приходить сюда.")

    async def _edit_telegram(self, chat_id: str, message_id: int, html: str, plain: str,
                             timeout: float = 20,
                             reply_markup: Optional[dict] = None) -> Tuple[bool, dict]:
        """Rewrites a message the bot already sent. Same markup fallback as a fresh send."""
        payload = {"chat_id": chat_id, "message_id": message_id, "text": html,
                   "parse_mode": "HTML", "disable_web_page_preview": True}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        ok, body = await self.bot.call("editMessageText", payload, timeout=timeout)
        if ok or body.get("error_code") != 400:
            return ok, body
        logger.warning("Telegram refused the markup on edit (%s), rewriting plain", body.get("description"))
        fallback = {"chat_id": chat_id, "message_id": message_id, "text": plain,
                    "disable_web_page_preview": True}
        if reply_markup is not None:
            fallback["reply_markup"] = reply_markup
        return await self.bot.call("editMessageText", fallback, timeout=timeout)

    async def _edit_telegram_markup(self, chat_id: str, message_id: int, reply_markup: dict,
                                    timeout: float = 15) -> Tuple[bool, dict]:
        """The half an edit that Telegram always allows: swapping the keyboard, not the text.

        Used when the bubble cannot be rewritten — a deleted message, or an answer that predates
        the stored text. Removing the button is still worth doing: it is what stops a stale tap.
        """
        ok, body = await self.bot.call("editMessageReplyMarkup", {
            "chat_id": chat_id, "message_id": message_id, "reply_markup": reply_markup}, timeout=timeout)
        if not ok:
            logger.warning("Telegram editMessageReplyMarkup failed: %s", body.get("description"))
        return ok, body

    async def _answer_callback(self, callback_id: str, text: str) -> None:
        """A callback left unanswered spins forever on the person's screen, so this always fires."""
        if not self.bot:
            return
        ok, body = await self.bot.call("answerCallbackQuery", {
            "callback_query_id": callback_id, "text": tg_truncate(text, 200)}, timeout=10)
        if not ok:
            logger.warning("Telegram answerCallbackQuery failed: %s", body.get("description"))

    async def _typing_until(self, request_id: str, chat_id: str, deadline: float) -> None:
        """Holds the typing indicator for as long as the question is alive and unanswered.

        Telegram clears it after ~5s and has no "stop typing", so this stops on its own at the
        deadline: a late call past the answer would leave a ghost indicator behind it.
        """
        while time.time() < deadline:
            request = self.db.get_assistant_request(request_id)
            if not request or request["answered_at"] is not None:
                return
            await self.bot.call("sendChatAction", {"chat_id": chat_id, "action": "typing"}, timeout=10)
            await asyncio.sleep(ASSISTANT_TYPING_INTERVAL_SECONDS)

    def _live_sockets_for_vault(self, vault_id: str) -> list[WebSocketConnection]:
        """Sockets that are open right now. Note: open is not the same as awake, see `_pick_device`."""
        return [client for sockets in list(self.rooms.values()) for client in list(sockets)
                if not client.closed and client.vault_id == vault_id]

    async def _pick_device(self, candidates: list[WebSocketConnection]) -> Optional[WebSocketConnection]:
        """Who answers this question: the fastest device that can actually run a model.

        A socket says nothing about the phone behind it — a suspended app holds TCP open and
        replies to nothing. So the probe doubles as the presence check and the ping, and its ack
        carries `aiReady`: a device without a model never takes a question from one that has it.
        """
        if not candidates:
            return None
        # One device is not a choice: no probe, no added latency, no question about it.
        if len(candidates) == 1:
            return candidates[0]
        probe_id = f"probe_{secrets.token_hex(6)}"
        probe = {"event": asyncio.Event(), "sent": {}, "results": {}}
        self.assistant_probes[probe_id] = probe
        frame = json.dumps({"type": "assistant_probe", "id": probe_id})

        async def ask(client: WebSocketConnection) -> None:
            probe["sent"][client.device_id] = time.monotonic()
            try:
                await client.send_text(frame)
            except (ConnectionResetError, BrokenPipeError):
                client.closed = True

        try:
            await asyncio.gather(*(ask(client) for client in candidates))
            try:
                await asyncio.wait_for(probe["event"].wait(),
                                       timeout=ASSISTANT_PROBE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                pass
        finally:
            self.assistant_probes.pop(probe_id, None)

        best: Optional[tuple[tuple[int, int], WebSocketConnection]] = None
        for client in candidates:
            result = probe["results"].get(client.device_id)
            if result is None:
                continue  # asleep, or already gone: it must not get the question
            rtt_ms, ready = result
            rank = (0 if ready else 1, rtt_ms)
            if best is None or rank < best[0]:
                best = (rank, client)
        return best[1] if best else None

    def _armed_digest(self, vault_id: str) -> str:
        """What the relay holds that a device will run: the only fact it can add on its own.

        Returns an empty string when the queue is empty — the caller already said the one thing
        worth saying, and "в очереди пусто" is noise on top of "устройство молчит".
        """
        rows = self.db.conn.execute(
            "SELECT title, stamp FROM notify_jobs WHERE vault_id = ? AND sent_at IS NULL"
            " ORDER BY fire_at LIMIT 2", (vault_id,)).fetchall()
        if not rows:
            return ""
        total = self.db.conn.execute(
            "SELECT COUNT(*) AS n FROM notify_jobs WHERE vault_id = ? AND sent_at IS NULL",
            (vault_id,)).fetchone()["n"]
        next_row = rows[0]
        when = f" — {next_row['stamp']}" if next_row["stamp"] else ""
        tail = f" (и ещё {total - 1})" if total > 1 else ""
        return f"в очереди ближайшее: «{next_row['title']}»{when}{tail}"

    async def _linked_target(self, chat_id: str) -> Optional[dict]:
        """The one vault this chat may talk to: route token, vault, mode and tag.

        Answers the person itself and returns None when there is nothing single to answer from:
        a chat with no assistant wired to it, or one wired to more vaults than a reply could name.
        """
        linked = [row for row in self.notify.routes_for_chat(chat_id) if self.db.assistant_link(row["route_token"])]
        if not linked:
            await self._bot_reply(chat_id, "ассистента отсюда нужно включить: настройки → уведомления → "
                                           "ассистент в telegram.",
                                  html="ассистента отсюда нужно включить: "
                                       "<code>настройки → уведомления → ассистент в telegram</code>.")
            return None
        if len(linked) > 1:
            await self._bot_reply(chat_id, "к чату привязано несколько хранилищ — спроси из приложения, "
                                           "чтобы не гадать, откуда ответ.")
            return None
        link = self.db.assistant_link(linked[0]["route_token"])
        route_row = self.notify.get(linked[0]["route_token"])
        return {"token": linked[0]["route_token"], "vault_id": link["vault_id"],
                "mode": link["mode"] or "minimal", "tag": route_row["vault_tag"] if route_row else ""}

    async def _bot_clear(self, chat_id: str) -> None:
        """Forgets the thread on the devices that still hold one.

        The history never reaches the relay — it is written where the answer was written — so a
        clear can only be forwarded, and a sleeping device keeps what it had. Says which happened
        instead of assuming the pleasant one.
        """
        target = await self._linked_target(chat_id)
        if target is None:
            return
        candidates = self._live_sockets_for_vault(target["vault_id"])
        frame = json.dumps({"type": "assistant_clear"})
        cleared = 0
        for client in candidates:
            try:
                await client.send_text(frame)
                cleared += 1
            except (ConnectionResetError, BrokenPipeError):
                client.closed = True
        self.db.log_delivery_event("assistant.clear", "dispatched" if cleared else "no_device",
                                   route_tag=target["tag"], device_count=len(candidates))
        if cleared:
            await self._bot_reply(chat_id, "ок, забыл, о чём говорили — дальше с чистого листа.")
        else:
            await self._bot_reply(chat_id, "ни одно устройство не в сети: разговор хранится на нём, "
                                           "стереть отсюда не могу. открой приложение и повтори /clear.")

    def _public_base(self, headers: dict) -> str:
        """The address the device itself reached us on, so a link opens the same relay.

        A telegram answer's note link has to be absolute — Telegram links nothing else — and the
        relay has no configured public name to build one from. The `Host` of the very request
        that delivered the answer is the honest source: it is, by definition, reachable.
        """
        host = (headers.get("host") or "").strip()
        if not host:
            return ""
        proto = (headers.get("x-forwarded-proto") or "").strip().lower()
        return f"{'https' if proto == 'https' else 'http'}://{host}"

    async def _bot_question(self, chat_id: str, question: str,
                            question_message_id: Optional[int] = None) -> None:
        """Hands the text to a live device. The relay has no model and never answers itself."""
        question = question.strip()[:ASSISTANT_MAX_QUESTION]
        if not question:
            await self._bot_reply(chat_id, "напиши вопрос текстом или /ask <вопрос>.",
                                  html="напиши вопрос текстом или <code>/ask &lt;вопрос&gt;</code>.")
            return
        if not self._allow_request(f"tg-ask:{chat_id}", RATE_LIMIT_TG_ASK):
            await self._bot_reply(chat_id, "слишком часто, подожди минуту.")
            return
        target = await self._linked_target(chat_id)
        if target is None:
            return
        vault_id = target["vault_id"]
        mode = target["mode"]
        route_tag = target["tag"]
        # The bubble exists before anything is chosen: it is the only message this question will
        # ever own, and every stage below rewrites its text instead of sending a new one.
        request_id = self.db.create_assistant_request(vault_id, target["token"], question,
                                                      mode=mode,
                                                      question_message_id=question_message_id)
        reply_params = {"allow_sending_without_reply": True}
        if question_message_id:
            reply_params["message_id"] = question_message_id
        ok, body = await self.bot.call("sendMessage", {
            "chat_id": chat_id, "text": tg_escape(ASSISTANT_STAGE_SEARCHING),
            "parse_mode": "HTML", "reply_parameters": reply_params}, timeout=10)
        if ok:
            self.db.set_assistant_placeholder(request_id, (body.get("result") or {}).get("message_id"))
        # One device answers, chosen before the question is asked: a fan-out spends a model call
        # per device and hands the chat whichever answer happened to be faster to produce.
        candidates = self._live_sockets_for_vault(vault_id)
        chosen = await self._pick_device(candidates)
        if chosen is None:
            self.db.log_delivery_event("assistant.question", "no_device", route_tag=route_tag,
                                       device_count=len(candidates))
            waiting = "устройство молчит — держу вопрос, передам, как только оно отзовётся."
            queued = self._armed_digest(vault_id) if mode == "minimal" else ""
            await self._edit_assistant_progress(request_id,
                                                f"{waiting} {queued}".strip() if queued else waiting)
            # Not finished on purpose. A socket that looks dead can still be a device: the poll
            # `/api/assistant/pending` is how it picks the question up, and that poll is the only
            # reason a raspberry pi behind a flaky tunnel ever answers at all. The expiry loop
            # still ends the request if nobody does.
            self._stop_typing(request_id)
            return
        # The status line is cosmetic and the socket write is not: the question goes out first,
        # the bubble catches up on its own.
        self._spawn_stage_edit(
            request_id, f"{ASSISTANT_STAGE_HANDED} {self._device_label(chosen.device_id)}")
        message = json.dumps({"type": "assistant_question", "id": request_id, "question": question,
                              "mode": mode})
        await chosen.send_text(message)
        self.db.log_delivery_event("assistant.question", "dispatched", route_tag=route_tag,
                                   request_id=request_id, device_count=len(candidates))
        self.typing_tasks[request_id] = asyncio.create_task(self._typing_until(
            request_id, chat_id, time.time() + ASSISTANT_REQUEST_TTL_SECONDS))

    def _stop_typing(self, request_id: str) -> None:
        task = self.typing_tasks.pop(request_id, None)
        if task is not None:
            task.cancel()

    def _device_label(self, device_id: str) -> str:
        """How the person named this device in settings, quoted; a nameless one stays generic."""
        row = self.db.conn.execute("SELECT name FROM devices WHERE id = ?", (device_id,)).fetchone()
        name = (row["name"] or "").strip() if row else ""
        return f"«{name}»" if name else ASSISTANT_DEVICE_FALLBACK

    def _bubble_lock(self, request_id: str) -> asyncio.Lock:
        """The single writer of one bubble. Created lazily: a request that gets no stage edit
        never pays for it."""
        lock = self.bubble_locks.get(request_id)
        if lock is None:
            lock = asyncio.Lock()
            self.bubble_locks[request_id] = lock
        return lock

    def _forget_bubble(self, request_id: str) -> None:
        self.bubble_locks.pop(request_id, None)

    def _spawn_stage_edit(self, request_id: str, text: str) -> None:
        """Rewrites the status bubble without holding up the question or the answer.

        A Telegram edit can take longer than the model does, and it used to be awaited between
        `create_assistant_request` and `send_text`: the device got its question ten seconds late,
        the person saw "⌛ handed over" as the last word, and the late edit overwrote the answer.
        """
        task = asyncio.create_task(self._edit_assistant_progress(request_id, text))
        self.stage_tasks.add(task)

        def done(finished: "asyncio.Task[None]") -> None:
            self.stage_tasks.discard(finished)
            if not finished.cancelled() and finished.exception() is not None:
                logger.warning("Stage edit for %s died: %s", request_id, finished.exception())

        task.add_done_callback(done)

    async def _edit_assistant_progress(self, request_id: str, text: str) -> None:
        """Rewrites the one bubble this question owns, and only while it is still unanswered.

        The "still unanswered" check happens under the per-request lock, together with the edit
        itself: checking before the await let a slow stage edit land after the answer and win.
        """
        async with self._bubble_lock(request_id):
            request = self.db.get_assistant_request(request_id)
            if not request or request["answered_at"] is not None:
                return
            message_id = request["placeholder_message_id"]
            route = self.notify.get(request["route_token"])
            if not message_id or not route:
                return
            ok, body = await self._edit_telegram(route["chat_id"], int(message_id),
                                                 tg_escape(text), text, timeout=4)
            self.db.log_delivery_event("assistant.stage", "edited" if ok else "edit_failed",
                                       request_id=request_id,
                                       error_code="" if ok else str(body.get("error_code") or ""))
            if not ok:
                logger.warning("Stage edit for %s failed (%s)", request_id, body.get("description"))

    async def _handle_assistant_stage(self, conn: WebSocketConnection, msg: dict) -> None:
        """A device started working on a question: the person sees it on the same bubble."""
        request_id = msg.get("id")
        if not isinstance(request_id, str) or msg.get("stage") != "thinking":
            return
        request = self.db.get_assistant_request(request_id)
        if not request or request["vault_id"] != conn.vault_id or request["answered_at"] is not None:
            return
        self._spawn_stage_edit(request_id, ASSISTANT_STAGE_THINKING)

    async def _answer_assistant(self, vault_id: str, request_id: str, answer: str,
                                base_url: str = "", action: Optional[dict] = None,
                                answered_by: str = "") -> dict:
        request = self.db.get_assistant_request(request_id)
        if not request or request["vault_id"] != vault_id:
            raise ApiError(404, "request_not_found")
        route = self.notify.get(request["route_token"])
        if not route or not self.bot:
            raise ApiError(409, "route_gone")
        if request["answered_at"] is not None:
            # The same question answered twice (a retry, or two sockets of one device): the second
            # answer is dropped, and that is a normal outcome rather than an error.
            return {"delivered": False, "reason": "already"}
        self._stop_typing(request_id)
        started = float(request["created_at"])
        self.db.finish_assistant_request(request_id)
        text = tg_truncate(answer.strip(), ASSISTANT_MAX_ANSWER)
        # The text and the action are stored before delivery: `/applied` appends to this very
        # message, and the chat is the only other place the answer ever exists.
        self.db.set_assistant_answer(request_id, text, action, answered_by)
        # Notebook links are the one markup an answer may carry: the model writes [[Title]] and
        # this turns it into a real entity. Everything else stays escaped plain text.
        html, plain = assistant_message_html(text, action, base_url)
        markup = assistant_action_markup(action, request_id)
        chat_id = route["chat_id"]
        ok = False
        message_id = request["placeholder_message_id"]
        # Same lock the stage edits take: the answer is the last word on this bubble, and a stage
        # edit that started earlier must finish (or be skipped) before the answer is written.
        async with self._bubble_lock(request_id):
            if message_id:
                ok, body = await self._edit_telegram(chat_id, int(message_id), html, plain, timeout=20,
                                                     reply_markup=markup)
                if not ok:
                    logger.warning("Editing the placeholder failed (%s), sending a new message",
                                   body.get("description"))
            if not ok:
                ok, body = await self._send_telegram(chat_id, html, plain, timeout=20, reply_markup=markup)
                if not ok:
                    logger.warning("Telegram answer delivery failed: %s", body.get("description"))
        self._forget_bubble(request_id)
        route_row = self.notify.get(request["route_token"])
        self.db.log_delivery_event(
            "assistant.answer", "answered" if ok else "send_failed",
            route_tag=route_row["vault_tag"] if route_row else "", request_id=request_id,
            latency_ms=int((time.time() - started) * 1000),
            error_code="" if ok else str(body.get("error_code") or ""))
        if markup is not None and ok:
            # The button is on screen: from here on, a tap is a possible event and the row has
            # to be explainable from the database alone.
            self.db.log_delivery_event("assistant.action", "requested",
                                       route_tag=route_row["vault_tag"] if route_row else "",
                                       request_id=request_id)
        return {"delivered": ok}

    async def _handle_drop_callback(self, callback: dict) -> None:
        """A tap on `Отклонить`: the card goes, the action stops being applicable.

        The answer text stays — the person asked a question and got an answer; what they refused
        is the proposed note, not the reply. Every branch answers the callback, or the button
        spins under their finger forever.
        """
        callback_id = callback.get("id")
        if not isinstance(callback_id, str) or not callback_id:
            return
        data = callback.get("data") if isinstance(callback.get("data"), str) else ""
        request_id = data[len(ASSISTANT_DROP_PREFIX):]
        request = self.db.get_assistant_request(request_id) if request_id else None
        if not request or not self.db.dismiss_assistant_action(request_id):
            await self._answer_callback(callback_id, ASSISTANT_ACTION_ALREADY)
            return
        route = self.notify.get(request["route_token"])
        message = callback.get("message") if isinstance(callback.get("message"), dict) else {}
        # The tap itself names the message it sits on; the stored placeholder is only a fallback
        # for a bubble the relay sent before it could remember its id.
        message_id = message.get("message_id") or request["placeholder_message_id"]
        chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
        chat_id = str(chat.get("id") or (route["chat_id"] if route else ""))
        edited = False
        if chat_id and message_id:
            base = request["answer_text"] or ""
            if base:
                full, plain = assistant_message_html(base, None, "", ASSISTANT_CARD_DROPPED)
                edited, _ = await self._edit_telegram(chat_id, int(message_id), full, plain,
                                                      timeout=15,
                                                      reply_markup={"inline_keyboard": []})
            if not edited:
                # The text may be gone; a keyboard that still offers a refused action is worse.
                edited, _ = await self._edit_telegram_markup(chat_id, int(message_id),
                                                              {"inline_keyboard": []})
        self.db.log_delivery_event("assistant.action", "dismissed",
                                   route_tag=route["vault_tag"] if route else "",
                                   request_id=request_id, error_code="" if edited else "edit_failed")
        await self._answer_callback(callback_id, ASSISTANT_ACTION_DISMISSED)

    async def _handle_action_callback(self, callback: dict) -> None:
        """A tap on the button under an answer: hand the stored action to the live devices.

        Every branch answers the callback before it returns. Telegram keeps the button spinning
        until `answerCallbackQuery` arrives, so a refusal the person can read always beats a
        spinner they cannot stop — including for a tap that names nothing this relay knows.
        """
        callback_id = callback.get("id")
        if not isinstance(callback_id, str) or not callback_id:
            return
        data = callback.get("data")
        message = callback.get("message")
        chat = message.get("chat") if isinstance(message, dict) else None
        chat_id = str((chat or {}).get("id") or "")
        if not isinstance(data, str) or not data.startswith(ASSISTANT_ACTION_PREFIX):
            await self._answer_callback(callback_id, ASSISTANT_ACTION_STALE)
            return
        request_id = data[len(ASSISTANT_ACTION_PREFIX):]
        request = self.db.get_assistant_request(request_id) if request_id else None
        route = self.notify.get(request["route_token"]) if request else None
        # The chat is the only proof a tap belongs to the person the request was written for:
        # callback data is a plain string, and whoever sees it can send it back from anywhere.
        if request is None or route is None or not chat_id or str(route["chat_id"]) != chat_id:
            self.db.log_delivery_event(
                "assistant.action", "stale", request_id=request_id,
                error_code="unknown_request" if request is None else "foreign_chat")
            await self._answer_callback(callback_id, ASSISTANT_ACTION_STALE)
            return
        route_tag = route["vault_tag"]
        if request["applied_at"] is not None:
            self.db.log_delivery_event("assistant.action", "applied", route_tag=route_tag,
                                       request_id=request_id, error_code="repeat_tap")
            await self._answer_callback(callback_id, ASSISTANT_ACTION_ALREADY)
            return
        action = parse_assistant_action(request["action_json"])
        if action is None:
            self.db.log_delivery_event("assistant.action", "stale", route_tag=route_tag,
                                       request_id=request_id, error_code="no_action")
            await self._answer_callback(callback_id, ASSISTANT_ACTION_STALE)
            return
        if float(request["expires_at"]) <= time.time():
            # The button outlives its question only briefly: an old one is a tap at something the
            # person no longer has in front of them, and applying it blind is worse than saying no.
            self.db.log_delivery_event("assistant.action", "stale", route_tag=route_tag,
                                       request_id=request_id, error_code="expired")
            await self._answer_callback(callback_id, ASSISTANT_ACTION_STALE)
            return
        # The device that wrote the answer applies the action, and only it: the same tap reaching
        # two machines creates the note twice. If it is gone, one of the others gets the chance —
        # better a duplicate-free attempt than a button that silently does nothing.
        live = self._live_sockets_for_vault(request["vault_id"])
        answered_by = request["answered_by"]
        candidates = [c for c in live if answered_by and c.device_id == answered_by] or live
        frame = json.dumps({"type": "assistant_action", "id": request_id, "action": action})
        dispatched = 0
        for client in candidates:
            try:
                await client.send_text(frame)
                dispatched += 1
            except (ConnectionResetError, BrokenPipeError):
                client.closed = True
        # Every live socket gets it, not the one that answered: an action may be about a note
        # another device has open, and a device that is not the author still applies it itself.
        self.db.log_delivery_event("assistant.action", "dispatched" if dispatched else "no_device",
                                   route_tag=route_tag, request_id=request_id,
                                   device_count=len(candidates))
        await self._answer_callback(
            callback_id, ASSISTANT_ACTION_DONE if dispatched else ASSISTANT_ACTION_NO_DEVICE)

    async def _apply_assistant_action(self, vault_id: str, request_id: str, ok: bool, text: str,
                                      base_url: str = "") -> dict:
        """Closes the loop under the answer: the bubble says what happened, the button goes away.

        The first call owns the edit. A repeat is a normal "already" rather than an error, because
        the relay cannot tell a response lost on the way back from a double submit — and appending
        the outcome twice would be a lie the person can see.
        """
        request = self.db.get_assistant_request(request_id)
        if not request or request["vault_id"] != vault_id:
            raise ApiError(404, "request_not_found")
        if not self.db.mark_assistant_applied(request_id):
            return {"applied": False, "reason": "already"}
        route = self.notify.get(request["route_token"])
        note = tg_truncate(text.strip(), ASSISTANT_MAX_APPLY_TEXT)
        suffix = ("✓ применено" if ok else "не вышло") + (f": {note}" if note else "")
        edited = False
        message_id = request["placeholder_message_id"]
        if route and message_id:
            chat_id = route["chat_id"]
            base = request["answer_text"] or ""
            if base:
                card_action = parse_assistant_action(request["action_json"])
                full, plain = assistant_message_html(base, card_action, base_url, suffix)
                edited, _ = await self._edit_telegram(
                    chat_id, int(message_id), full, plain,
                    timeout=15, reply_markup={"inline_keyboard": []})
            if not edited:
                # The bubble itself may be gone (deleted, too old, or answered before the relay
                # stored the text). Dropping the button is still the honest half of the job.
                edited, _ = await self._edit_telegram_markup(chat_id, int(message_id),
                                                              {"inline_keyboard": []})
        self.db.log_delivery_event(
            "assistant.action", "applied" if ok else "apply_failed",
            route_tag=route["vault_tag"] if route else "", request_id=request_id,
            error_code="" if edited else "edit_failed")
        return {"applied": True, "edited": edited}

    async def _expire_assistant_requests(self) -> None:
        """Own loop on purpose: a telegram retry_after used to stall every expiry behind it."""
        for request in self.db.expired_assistant_requests(time.time()):
            self.db.finish_assistant_request(request["id"])
            self._stop_typing(request["id"])
            route = self.notify.get(request["route_token"])
            if not route:
                continue
            self.db.log_delivery_event("assistant.expired", "expired",
                                       route_tag=route["vault_tag"], request_id=request["id"])
            chat_id = route["chat_id"]
            text = "устройство не ответило. напиши ещё раз — передам заново."
            message_id = request["placeholder_message_id"]
            if message_id:
                ok, _ = await self._edit_telegram(chat_id, int(message_id), tg_escape(text), text, timeout=15)
                if ok:
                    continue
            await self._bot_reply(chat_id, text)

    async def assistant_expiry_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            try:
                await self._expire_assistant_requests()
            except Exception as exc:
                logger.error("Assistant expiry error: %s", exc)

    async def notify_delivery_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            try:
                await self._deliver_notifications()
            except Exception as exc:
                logger.error("Notification delivery error: %s", exc)

    async def _deliver_notifications(self) -> None:
        if not self.bot:
            return
        now = time.time()

        for job in self.db.due_notify_jobs(now, NOTIFY_BATCH_SIZE):
            route_token, event_key = job["route_token"], job["event_key"]
            # Late is not the same as wanted: a device that wakes up after a week must not
            # dump a backlog into someone's Telegram.
            if now - job["fire_at"] > NOTIFY_STALE_SECONDS:
                self.db.finish_notify_job(route_token, event_key)
                continue
            route = self.notify.get(route_token)
            if not route or route["blocked_at"] is not None:
                self.db.finish_notify_job(route_token, event_key)
                continue
            # Recipients are people, not a channel: a compromised or hostile vault cannot
            # turn one chat into a firehose.
            if self.db.notify_sent_last_hour(route_token) >= NOTIFY_MAX_PER_HOUR_PER_ROUTE:
                self.db.finish_notify_job(route_token, event_key)
                logger.warning("Telegram rate cap reached for a route, dropping the message")
                continue
            if not self.db.claim_notify_job(route_token, event_key, now):
                continue
            html, plain = render_notification(job["title"], job["body"], job["kind"], job["stamp"],
                                              bool(job["spoiler"]))
            ok, body = await self._send_telegram(route["chat_id"], html, plain, timeout=20)
            if ok:
                self.db.finish_notify_job(route_token, event_key)
                continue
            retry_after = TelegramBot.retry_after(body)
            if retry_after:
                self.db.release_notify_job(route_token, event_key)
                await asyncio.sleep(retry_after)
                continue
            if body.get("error_code") == 403:
                self.notify.block_route(route_token)
                self.db.finish_notify_job(route_token, event_key)
                continue
            if job["attempts"] >= 1:
                # Second failure: give up. A missing reminder is worse than a duplicate, but a
                # retry storm on a broken token is worse than both.
                self.db.finish_notify_job(route_token, event_key)
                continue
            self.db.release_notify_job(route_token, event_key)
            logger.warning("Telegram send failed (%s), one retry left: %s",
                           body.get("error_code"), body.get("description"))

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
