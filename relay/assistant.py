"""Ассистент из Telegram: выбор устройства, стадии «печатает», ответ, action-кнопки.

Модели у релея нет. Вопрос уезжает на одно устройство, ответ возвращается тем же путём,
а пузырь `⌛ передал на …` редактируется на месте, а не заменяется вторым сообщением.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Optional

from settings import *
from wire import WebSocketConnection
from assistant_card import *
import secrets
from errors import ApiError
from tg import render_answer_links


class AssistantDomain:

    def _live_sockets_for_vault(self, vault_id: str) -> list[WebSocketConnection]:
        """Sockets that are open right now. Note: open is not the same as awake, see `_pick_device`."""
        return [client for sockets in list(self.rooms.values()) for client in list(sockets)
                if not client.closed and client.vault_id == vault_id]

    def _fresh_sockets(self, candidates: list[WebSocketConnection]) -> list[WebSocketConnection]:
        """Sockets that said something recently, which is the cheapest presence signal we have.

        Devices ping every 25 seconds; an app that was suspended keeps its TCP connection open
        and sends nothing. Probing such a socket costs the whole probe timeout and gains nothing,
        and with four devices in one room that timeout was paid on every single question.
        """
        now = time.monotonic()
        return [client for client in candidates
                if not client.closed
                and now - getattr(client, "last_frame_at", now) <= ASSISTANT_PRESENCE_WINDOW_SECONDS]

    async def _pick_device(self, candidates: list[WebSocketConnection]) -> Optional[WebSocketConnection]:
        """Who answers this question: the fastest device that can actually run a model.

        A socket says nothing about the phone behind it — a suspended app holds TCP open and
        replies to nothing. So the probe doubles as the presence check and the ping, and its ack
        carries `aiReady`: a device without a model never takes a question from one that has it.

        Freshness goes first: a socket silent for longer than the presence window is skipped
        before the probe, not timed out by it. When nothing is fresh the probe still runs over
        everything — at that point it is the only honest presence test left.
        """
        if not candidates:
            return None
        fresh = self._fresh_sockets(candidates)
        pool = fresh or candidates
        # One living device is not a choice: no probe, no added latency, no question about it.
        if len(pool) == 1 and fresh:
            return pool[0]
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
            await asyncio.gather(*(ask(client) for client in pool))
            try:
                await asyncio.wait_for(probe["event"].wait(),
                                       timeout=ASSISTANT_PROBE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                pass
        finally:
            self.assistant_probes.pop(probe_id, None)

        best: Optional[tuple[tuple[int, int], WebSocketConnection]] = None
        for client in pool:
            result = probe["results"].get(client.device_id)
            if result is None:
                continue  # asleep, or already gone: it must not get the question
            rtt_ms, ready = result
            rank = (0 if ready else 1, rtt_ms)
            if best is None or rank < best[0]:
                best = (rank, client)
        return best[1] if best else None

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
