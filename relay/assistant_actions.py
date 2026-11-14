"""Action-кнопки ответа: «создать заметку» и «отклонить», плюс применение на устройстве.

Ответ устройства может нести действие; релей хранит его подпись и текст, чтобы применить
один раз и дописать исход в то же сообщение — второго сообщения человек не ждёт.
"""

from __future__ import annotations

import json
import time
from typing import Optional

from settings import *
from assistant_card import *
from tg import render_answer_links
from errors import ApiError


class AssistantActions:
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
