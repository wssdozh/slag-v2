"""Константы релея: TTL, лимиты, тексты бота, тарифы.

Лист графа: только stdlib. Всё, что зависит от окружения, читается в `server.py`
при старте, здесь — значения по умолчанию.
"""

from __future__ import annotations

import logging
import re


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
# How recently a socket must have said something to be a candidate for a question. Devices ping
# every 25 seconds, so a socket quiet for longer than this is a suspended app holding TCP open:
# it answers nothing, and probing it costs the whole timeout above. When nothing is fresh the
# probe still runs — it is the presence test, just not the first one.
ASSISTANT_PRESENCE_WINDOW_SECONDS = 40
# How far behind the newest bundle a device may be and still answer. A device that pushed the
# newest bundle itself is current by definition: it is the one that wrote it.
ASSISTANT_SYNC_SLACK_SECONDS = 300
ASSISTANT_MAX_QUESTION = 1000
ASSISTANT_MAX_ANSWER = 4000
# One bubble per question: these are its texts, in the order the person sees them. The leading
# glyphs are premium emoji from `premium.pe()`: animated for a Premium owner, plain otherwise.
ASSISTANT_STAGE_SEARCHING = "ищу устройство…"
ASSISTANT_STAGE_HANDED = "передал на"
ASSISTANT_STAGE_THINKING = "печатает ответ…"
# How a device names itself in that bubble when the relay knows nothing better.
ASSISTANT_DEVICE_FALLBACK = "устройство"
# An answer may offer one action. The button carries only `act:<requestId>`: the action itself
# stays in the database, so the callback data never has to fit Telegram's 64-byte cap and a
# replay of the tap cannot smuggle in a different payload.
ASSISTANT_ACTION_PREFIX = "act:"
# The second button: a card that is not wanted is a card that must be able to disappear.
ASSISTANT_DROP_PREFIX = "drop:"
# Bot API 9.4 colours a button with one of three preset styles; there is no palette and no hex.
# Only the confirm half gets one: a grey refusal is quieter than a red one, and refusing to save
# a draft is not a destructive act.
ASSISTANT_CONFIRM_STYLE = "success"
ASSISTANT_ACTION_BUTTON_MAX = 64
# The card is drawn from fields the device worded; these are the ceilings on what it may print.
ASSISTANT_CARD_FIELD_MAX = 120
ASSISTANT_CARD_DROP_LABEL = "Отклонить"
ASSISTANT_CARD_DROPPED = "✕ отклонено"
# Day first, priority after it: the reading order the confirmation card uses in the app.
ASSISTANT_CARD_PRIORITY = {"high": "🔴 HIGH", "medium": "🟡 MEDIUM", "low": "🔵 LOW"}
# The folder is drawn as a `<code>` chip — the only second texture Bot API HTML offers. Past this
# length a chip stops reading as a chip and eats the line the kind sits on.
ASSISTANT_CARD_CHIP_MAX = 48
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
