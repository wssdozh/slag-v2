"""Telegram-бот: long polling, команды, привязка чата к хранилищу.

Один поллер на токен — второй получает 409 от Telegram, и это не баг, а правило.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Optional, Tuple

from settings import *
from assistant_card import without_button_styles
from tg import TG_TEXT_LIMIT, tg_truncate
from tg import TelegramBot, render_note_page, tg_escape


class BotDomain:
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
            fallback["reply_markup"] = without_button_styles(reply_markup)
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
            status = self._chat_status(chat_id)
            if status is not None:
                await self._bot_reply(chat_id, status[1], html=status[0])
                return
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

    @staticmethod
    def _id_head(value: str) -> str:
        """The four characters that name an id: what follows the `vault_`/`acc_` prefix.

        The prefix is the same for every row, and the tail is what a person does not recognize —
        they read `<vault name> • 3721` and check the beginning of the id against it.
        """
        if not value:
            return ""
        return (value.split("_", 1)[-1] if "_" in value else value)[:4]

    def _chat_status(self, chat_id: str) -> Optional[Tuple[str, str]]:
        """(html, plain) for the vault this chat already talks to, or None when it talks to none.

        `/start` is the only place a person can see *which* vault answers them, and two vaults
        named the same are the usual way to get that wrong: the id is what tells them apart.
        A chat with no assistant link has no route-to-vault row left in the database, so it says
        that instead of guessing a name.
        """
        routes = self.notify.routes_for_chat(chat_id)
        if not routes:
            return None
        html_blocks: list[str] = []
        plain_blocks: list[str] = []
        for route in routes[:3]:
            link = self.db.assistant_link(route["route_token"])
            row = self.db.conn.execute(
                "SELECT v.name, v.owner_account_id, a.display_name FROM vaults v"
                " LEFT JOIN accounts a ON a.account_id = v.owner_account_id WHERE v.id = ?",
                (link["vault_id"],)).fetchone() if link else None
            if link:
                # Short, the way the app shows it: a name and the four characters that make two
                # vaults with the same name distinguishable at a glance.
                vault_name = (row["name"] if row else "") or "хранилище"
                display_name = ((row["display_name"] if row else "") or "").strip()
                mode = link["mode"] or "minimal"
                account_tail = self._id_head((row["owner_account_id"] if row else "") or "")
                vault_head = self._id_head(link["vault_id"])
                vault_line = f"{vault_name} • {vault_head}"
                if display_name:
                    lines_html = [f"<b>{tg_escape(display_name)}</b> • <code>{tg_escape(account_tail)}</code>",
                                  f"{tg_escape(vault_name)} • <code>{tg_escape(vault_head)}</code>"]
                    lines_plain = [f"{display_name} • {account_tail}", vault_line]
                else:
                    lines_html = [f"<b>{tg_escape(vault_name)}</b> • <code>{tg_escape(vault_head)}</code>"]
                    lines_plain = [vault_line]
                    if account_tail:
                        lines_html.append(f"аккаунт • <code>{tg_escape(account_tail)}</code>")
                        lines_plain.append(f"аккаунт • {account_tail}")
                lines_html.append(f"уведомления вкл · ассистент вкл · {tg_escape(mode)}")
                lines_plain.append(f"уведомления вкл · ассистент вкл · {mode}")
                html_blocks.append("\n".join(lines_html))
                plain_blocks.append("\n".join(lines_plain))
            else:
                html_blocks.append("<b>хранилище не привязано</b>\nуведомления вкл · ассистент выкл")
                plain_blocks.append("хранилище не привязано\nуведомления вкл · ассистент выкл")
        return "\n\n".join(html_blocks), "\n\n".join(plain_blocks)

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
            fallback["reply_markup"] = without_button_styles(reply_markup)
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
