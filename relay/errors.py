"""`ApiError` — единственный способ ответить 4xx/5xx из глубины хендлера.

`handle_http_request` ловит его и превращает в json; всё остальное в релее — 500.
"""


class ApiError(Exception):
    def __init__(self, status: int, error: str):
        super().__init__(error)
        self.status = status
        self.error = error
