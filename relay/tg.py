"""Telegram Bot API in one place: the client, the escaping and the message renderer.

Deliberately a leaf module: it imports nothing from the relay, so the queue, the bot loop and
the assistant can all use it without dragging the server in. Three Bot API calls, no framework.
"""

import asyncio
import http.client
import json
import queue
import re
import ssl
import urllib.parse
from typing import Optional, Tuple

TG_API_BASE = "https://api.telegram.org"
# Outgoing text is HTML, not MarkdownV2: three characters to escape instead of eighteen, and a
# missed escape costs a 400 on a message a human was waiting for.
TG_TEXT_LIMIT = 4096  # Bot API counts characters after the entities are parsed
TG_TEXT_BUDGET = 3800  # our own ceiling: room for tags, and `&` grows fivefold when escaped
TG_EXPANDABLE_AFTER = 120  # a longer quote is collapsed behind "show more"
TG_STAMP_MAX = 40
TG_KINDS = ("task", "overdue")
# `[[Название заметки]]` is how the app writes an internal link and how the model writes one.
# Telegram refuses to link a scheme it does not know, so the entity is built here, not in the text.
TG_WIKI_LINK = re.compile(r"\[\[([^\[\]\n]{1,120})\]\]")


def tg_escape(text: str) -> str:
    """Ampersand first: escaping `&` after `<` would edit the entities we just produced."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_answer_links(text: str, base_url: str = "") -> str:
    """An assistant answer as HTML, with its note links actually tappable.

    Telegram keeps a link entity only for http(s): a `slag://` href comes back from the API as
    no entity at all, silently. So the entity points at this relay's own one-tap page, and that
    page is what hands the scheme to the device. Without a base URL there is nowhere to point,
    so the brackets are simply dropped: the title reads as a title, not as broken markup.
    """
    pieces: list[str] = []
    position = 0
    for match in TG_WIKI_LINK.finditer(text):
        title = match.group(1).strip()
        if not title:
            continue
        pieces.append(tg_escape(text[position:match.start()]))
        if base_url:
            quoted = urllib.parse.quote(title, safe="")
            pieces.append(f'<a href="{base_url}/n?title={quoted}">{tg_escape(title)}</a>')
        else:
            pieces.append(tg_escape(title))
        position = match.end()
    pieces.append(tg_escape(text[position:]))
    return "".join(pieces)


def render_note_page(title: str) -> str:
    """The one page between Telegram and the app: it exists because Telegram drops our scheme.

    Deliberately dumb — no script, no data: a title the person already saw in the chat and a
    button that opens the app. Nothing about the vault travels through here.
    """
    quoted = urllib.parse.quote(title, safe="")
    heading = tg_escape(title) if title else "SLAG"
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>открыть в SLAG</title>
<style>
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center;
  background: #161616; color: #f4f4f5;
  font: 16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }}
main {{ padding: 24px; max-width: 360px; }}
p {{ margin: 0 0 6px; color: #71717a; font-size: 13px; }}
h1 {{ margin: 0 0 22px; font-size: 19px; font-weight: 600; line-height: 1.35; }}
a {{ display: block; padding: 14px 18px; border-radius: 10px; text-align: center;
  background: #f4f4f5; color: #161616; text-decoration: none; font-weight: 600; }}
small {{ display: block; margin-top: 18px; color: #52525b; font-size: 12px; }}
</style></head><body><main>
<p>заметка</p>
<h1>{heading}</h1>
<a href="slag://note?title={quoted}">открыть в SLAG</a>
<small>если ничего не открылось — приложения нет на этом устройстве.</small>
</main></body></html>
"""


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


class _ConnectionPool:
    """Idle HTTPS connections to the Bot API, a handful at most.

    urllib opens a fresh TLS handshake for every request, and one question costs two or three
    requests in a row (placeholder, stage, answer): the handshake is a visible slice of a wait
    somebody is staring at. A pool, not one shared connection, because the long poll holds its
    connection for the whole 25 seconds and would block every send behind a lock.
    """

    def __init__(self, host: str, limit: int = 4):
        self._host = host
        self._limit = limit
        self._idle: "queue.LifoQueue[http.client.HTTPSConnection]" = queue.LifoQueue()

    def take(self, timeout: float) -> http.client.HTTPSConnection:
        try:
            conn = self._idle.get_nowait()
        except queue.Empty:
            return http.client.HTTPSConnection(self._host, timeout=timeout,
                                               context=ssl.create_default_context())
        conn.timeout = timeout
        return conn

    def give(self, conn: http.client.HTTPSConnection) -> None:
        # More idle sockets than this is a leak, not a pool: the long poll never comes back here
        # anyway, so the ceiling only bounds a burst.
        if self._idle.qsize() < self._limit:
            self._idle.put_nowait(conn)
            return
        conn.close()

    def drop(self, conn: http.client.HTTPSConnection) -> None:
        try:
            conn.close()
        except OSError:
            pass


class TelegramBot:
    """Three Bot API calls, no framework.

    aiogram/python-telegram-bot own their own event loop and updater; this relay already runs
    one, and SLAG needs /start, /stop and sendMessage — no FSM, no middlewares, no keyboards.
    """

    def __init__(self, token: str):
        self.token = token
        self.username: Optional[str] = None
        host = urllib.parse.urlsplit(TG_API_BASE).netloc or "api.telegram.org"
        self._pool = _ConnectionPool(host)
        self._path_prefix = f"{urllib.parse.urlsplit(TG_API_BASE).path.rstrip('/')}/bot{token}"

    def redact(self, text: str) -> str:
        return text.replace(self.token, "<bot-token>") if self.token else text

    @staticmethod
    def retry_after(body: dict) -> Optional[float]:
        parameters = body.get("parameters")
        if isinstance(parameters, dict) and isinstance(parameters.get("retry_after"), (int, float)):
            return float(parameters["retry_after"])
        return None

    def _request(self, method: str, payload: dict, timeout: float) -> Tuple[bool, dict]:
        """One call over a reused connection. A pooled socket the server already closed fails on
        `request()` — that is the retry, not an error: a stale keep-alive must never cost a
        message a person was waiting for.
        """
        data = json.dumps(payload).encode("utf-8") if payload else None
        headers = {"Content-Type": "application/json"} if data else {}
        path = f"{self._path_prefix}/{method}"
        for attempt in (0, 1):
            conn = self._pool.take(timeout)
            try:
                conn.request("POST", path, body=data, headers=headers)
                response = conn.getresponse()
                raw = response.read()
            except (http.client.HTTPException, OSError, ValueError) as exc:
                # The bot token sits in the request path: never let an exception echo it to a log.
                self._pool.drop(conn)
                if attempt == 0:
                    continue
                return False, {"ok": False, "error_code": 0, "description": self.redact(str(exc))}
            if response.will_close:
                self._pool.drop(conn)
            else:
                self._pool.give(conn)
            try:
                body = json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                return False, {"ok": False, "error_code": int(getattr(response, "status", 0) or 0)}
            return bool(body.get("ok")), body
        return False, {"ok": False, "error_code": 0, "description": "telegram_unreachable"}

    async def call(self, method: str, payload: dict, timeout: float = 20) -> Tuple[bool, dict]:
        return await asyncio.to_thread(self._request, method, payload, timeout)
