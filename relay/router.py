"""Диспетчер http: один список доменов вместо 1157-строчной цепочки `if`.

Порядок важен и совпадает с историческим: служебные точки, админка, авторизация,
уведомления, хранилища, модели, статика. Первый ответивший забирает запрос;
`_NEXT` — «не моё, ищи дальше». Роутер, который вернёт `None`, сервер поймёт как
«ответ уже отправлен», поэтому домены обязаны заканчиваться `return _NEXT`.
"""

from typing import Optional


_NEXT = object()


class HttpRouter:
    async def _route_http(self, method: str, path: str, query: dict, body: dict, headers: dict,
                          writer) -> Optional[tuple[dict, int]]:
        for handler in self._handlers():
            result = await handler(method, path, query, body, headers, writer)
            if result is not _NEXT:
                return result
        return {"error": "not_found", "path": path}, 404

    def _handlers(self) -> tuple:
        """Порядок — часть контракта: prefix-блоки одного домена не видят запросы другого."""
        return (
            self._route_health,
            self._route_admin,
            self._route_admin_ops,
            self._route_auth,
            self._route_notify,
            self._route_vaults,
            self._route_ai,
            self._route_static,
        )
