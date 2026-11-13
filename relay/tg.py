"""Telegram Bot API in one place: the client, the escaping and the message renderer.

Deliberately a leaf module: it imports nothing from the relay, so the queue, the bot loop and
the assistant can all use it without dragging the server in. Three Bot API calls, no framework.
"""

import asyncio
import json
import urllib.error
import urllib.request
from typing import Optional, Tuple

TG_API_BASE = "https://api.telegram.org"
# Outgoing text is HTML, not MarkdownV2: three characters to escape instead of eighteen, and a
# missed escape costs a 400 on a message a human was waiting for.
TG_TEXT_LIMIT = 4096  # Bot API counts characters after the entities are parsed
TG_TEXT_BUDGET = 3800  # our own ceiling: room for tags, and `&` grows fivefold when escaped
TG_EXPANDABLE_AFTER = 120  # a longer quote is collapsed behind "show more"
TG_STAMP_MAX = 40
TG_KINDS = ("task", "overdue")


def tg_escape(text: str) -> str:
    """Ampersand first: escaping `&` after `<` would edit the entities we just produced."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def tg_truncate(text: str, limit: int) -> str:
    """Cut raw text, never markup: escaping runs after, so no entity can be split in half."""
    if limit <= 0:
        return ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _notification_html(title: str, body: str, kind: str, stamp: str, spoiler: bool) -> str:
    header = "⚠️ " if kind == "overdue" else ""
    parts = [f"{header}<b>{tg_escape(title)}</b>"]
    if body:
        quoted = tg_escape(body)
        if spoiler:
            quoted = f'<span class="tg-spoiler">{quoted}</span>'
        tag = "<blockquote expandable>" if len(body) > TG_EXPANDABLE_AFTER else "<blockquote>"
        parts.append(f"{tag}{quoted}</blockquote>")
    if stamp:
        parts.append(f'{"срок был" if kind == "overdue" else "срок"} <code>{tg_escape(stamp)}</code>')
    return "\n".join(parts)


def _notification_plain(title: str, body: str, kind: str, stamp: str) -> str:
    header = "⚠️ " if kind == "overdue" else ""
    parts = [f"{header}{title}"]
    if body:
        parts.append(body)
    if stamp:
        parts.append(f'{"срок был" if kind == "overdue" else "срок"} {stamp}')
    return "\n".join(parts)


def render_notification(title: str, body: str, kind: str, stamp: str, spoiler: bool) -> Tuple[str, str]:
    """(html, plain). The plain twin is what goes out when Telegram refuses the markup.

    The body is the only unbounded part, and escaping turns one `&` into five characters: the
    binary search finds the longest raw body whose escaped form still fits the budget.
    """
    title = title.strip() or "напоминание"
    body = body.strip()
    stamp = stamp.strip()
    low, high = 0, len(body)
    while low < high:
        middle = (low + high + 1) // 2
        candidate = tg_truncate(body, middle)
        if len(_notification_html(title, candidate, kind, stamp, spoiler)) <= TG_TEXT_BUDGET:
            low = middle
        else:
            high = middle - 1
    body = tg_truncate(body, low) if len(body) > low else body
    return (_notification_html(title, body, kind, stamp, spoiler),
            tg_truncate(_notification_plain(title, body, kind, stamp), TG_TEXT_LIMIT))


class TelegramBot:
    """Three Bot API calls, no framework.

    aiogram/python-telegram-bot own their own event loop and updater; this relay already runs
    one, and SLAG needs /start, /stop and sendMessage — no FSM, no middlewares, no keyboards.
    """

    def __init__(self, token: str):
        self.token = token
        self.username: Optional[str] = None
        self._api = f"{TG_API_BASE}/bot{token}"

    def redact(self, text: str) -> str:
        return text.replace(self.token, "<bot-token>") if self.token else text

    @staticmethod
    def retry_after(body: dict) -> Optional[float]:
        parameters = body.get("parameters")
        if isinstance(parameters, dict) and isinstance(parameters.get("retry_after"), (int, float)):
            return float(parameters["retry_after"])
        return None

    def _request(self, method: str, payload: dict, timeout: float) -> Tuple[bool, dict]:
        data = json.dumps(payload).encode("utf-8") if payload else None
        headers = {"Content-Type": "application/json"} if data else {}
        request = urllib.request.Request(f"{self._api}/{method}", data=data, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                return bool(body.get("ok")), body
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except (ValueError, OSError):
                body = {"ok": False, "error_code": exc.code}
            return False, body
        except (urllib.error.URLError, OSError, ValueError) as exc:
            # The bot token sits in the request URL: never let an exception echo it into a log.
            return False, {"ok": False, "error_code": 0, "description": self.redact(str(exc))}

    async def call(self, method: str, payload: dict, timeout: float = 20) -> Tuple[bool, dict]:
        return await asyncio.to_thread(self._request, method, payload, timeout)
