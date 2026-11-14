"""Две служебные точки: `/health` для мониторинга и `/n` — переходник на `slag://`.

`/n` — не просмотр заметки: телеграм не пропускает незнакомую схему, поэтому страница
отдаёт её устройству сама. Больше на этой странице ничего нет и не должно быть.
"""

from __future__ import annotations

import time

from settings import *
from tg import render_note_page
from router import _NEXT


class HealthRoutes:
    async def _route_health(self, method: str, path: str, query: dict, body: dict,
                            headers: dict, writer):
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
        return _NEXT
