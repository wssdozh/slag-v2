"""Карточка ассистента в Telegram: подпись кнопки, HTML сообщения, разбор action.

Чистые функции без I/O — их гоняют тесты и зовёт бот и http-слой.
"""

from __future__ import annotations

import json
import re
from typing import Optional, Tuple

from settings import *
from tg import render_answer_links, tg_escape, tg_truncate


APPROX_STRIP_TAGS = re.compile(r"<[^>]+>")


def assistant_action_label(action: Optional[dict]) -> Optional[str]:
    """The button's caption, or None when this action cannot be offered as a button at all.

    The label is the one field the relay interprets: without it there is nothing to put on the
    button, and an answer that silently lost its button is worse than a visible refusal.
    """
    if not isinstance(action, dict):
        return None
    label = action.get("label")
    if not isinstance(label, str) or not label.strip():
        return None
    return tg_truncate(label.strip(), ASSISTANT_ACTION_BUTTON_MAX)


def assistant_action_markup(action: Optional[dict], request_id: str) -> Optional[dict]:
    """`reply_markup` for an answer that offers an action, or None — never an empty keyboard.

    An empty inline keyboard is not "no button" to Telegram: it is an edit that strips whatever
    keyboard the message already has, so absence has to be spelled as the key being absent.
    """
    label = assistant_action_label(action)
    if label is None:
        return None
    return {"inline_keyboard": [[{"text": label,
                                  "callback_data": f"{ASSISTANT_ACTION_PREFIX}{request_id}",
                                  "style": ASSISTANT_CONFIRM_STYLE},
                                 {"text": ASSISTANT_CARD_DROP_LABEL,
                                  "callback_data": f"{ASSISTANT_DROP_PREFIX}{request_id}"}]]}


def without_button_styles(markup: Optional[dict]) -> Optional[dict]:
    """The same keyboard minus its colours.

    `style` arrived in Bot API 9.4. A relay talking to an older server would be refused the whole
    message over one field it does not know, and losing the button is cheaper than losing the
    answer — but only after trying the keyboard without the colour first.
    """
    if not isinstance(markup, dict) or not isinstance(markup.get("inline_keyboard"), list):
        return markup
    rows = [[{key: value for key, value in button.items() if key != "style"}
             for button in row if isinstance(button, dict)]
            for row in markup["inline_keyboard"] if isinstance(row, list)]
    return {**markup, "inline_keyboard": rows}


def assistant_card_block(action: Optional[dict]) -> str:
    """The card under an answer: what the action touches, in the app's reading order.

    The device words every field — it is the only side that knows the user's names for folders
    and the shape of their dates — so this function escapes and joins, and nothing else. An
    action from a device too old to send a card draws nothing rather than half a card.

    Only the title wears the quote bar. Wrapped around all three lines the bar says nothing: every
    fact gets the same weight and the one that matters — the thing that will be saved — drowns
    between its own metadata. So the bar marks the title, the folder takes a `<code>` chip, and
    kind/date/priority stay plain: three levels of emphasis out of the two levers Telegram has.
    """
    if not isinstance(action, dict):
        return ""
    card = action.get("card")
    if not isinstance(card, dict):
        return ""

    def field(key: str, limit: int = ASSISTANT_CARD_FIELD_MAX) -> str:
        value = card.get(key)
        if not isinstance(value, str):
            return ""
        return tg_escape(tg_truncate(value.strip(), limit))

    title = field("title")
    if not title:
        return ""
    folder = field("folder", ASSISTANT_CARD_CHIP_MAX)
    head = " · ".join(part for part in (field("kind"), f"<code>{folder}</code>" if folder else "")
                      if part)
    priority = ASSISTANT_CARD_PRIORITY.get(str(card.get("priority") or ""), "")
    meta = " · ".join(part for part in (field("due"), priority) if part)
    lines = [head, f"<blockquote><b>{title}</b></blockquote>", meta]
    return "\n".join(line for line in lines if line)


def assistant_message_html(answer: str, action: Optional[dict], base_url: str = "",
                           suffix: str = "") -> Tuple[str, str]:
    """The bubble: the answer, the card under it, and an optional outcome line.

    The card is paid for out of the answer's budget, not the other way round: truncating the
    tail would cut the card in half and leave a `blockquote` Telegram rejects as unbalanced.
    """
    card = assistant_card_block(action)
    tail = f"\n\n{suffix}" if suffix else ""
    budget = max(200, ASSISTANT_MAX_ANSWER - len(card) - len(tail))
    plain_answer = tg_truncate(answer.strip(), budget)
    html = render_answer_links(plain_answer, base_url)
    body = f"{html}\n\n{card}{tail}" if card else f"{html}{tail}"
    plain = f"{plain_answer}\n\n{APPROX_STRIP_TAGS.sub('', card)}{suffix}"
    return body, plain.strip()


def parse_assistant_action(encoded: Optional[str]) -> Optional[dict]:
    """The stored action, parsed. A row that never had one, or a corrupt one, offers nothing."""
    if not encoded:
        return None
    try:
        action = json.loads(encoded)
    except (TypeError, ValueError):
        return None
    return action if isinstance(action, dict) else None
