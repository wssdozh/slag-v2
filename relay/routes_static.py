"""Одна страница-переходник `/n` и раздача собранного веба.

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


class StaticRoutes:
    async def _route_static(self, method: str, path: str, query: dict, body: dict,
                     headers: dict, writer):
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
        return _NEXT
