"""Премиум-эмодзи: те самые анимированные, что живут в наборах телеграма.

Ограничение платформы одно и оно не наше: бот может отправлять `custom_emoji`, только если
у владельца бота есть Telegram Premium. Не премиум — клиент покажет обычный эмодзи рядом,
а если сервер вообще откажет в сущности, `_send_telegram` уже отправит тот же текст без
разметки. То есть худший случай — обычный 🔔 вместо анимированного.

Идентификаторы сняты через `getStickerSet` с боевого бота:
`t.me/addemoji/NewsEmoji` — первый выбор, `RestrictedEmoji` — второй, когда в первом набора
нужного символа нет.
"""

from __future__ import annotations

# name -> (обычный эмодзи для фолбэка, custom_emoji_id)
PREMIUM_EMOJI = {
    # t.me/addemoji/NewsEmoji
    "search": ("🔍", "5231012545799666522"),
    "hourglass": ("⌛", "5386367538735104399"),
    "pencil": ("✏️", "5395444784611480792"),
    "bell": ("🔔", "5458603043203327669"),
    "gear": ("⚙️", "5341715473882955310"),
    "house": ("🏠", "5416041192905265756"),
    "check": ("✔️", "5206607081334906820"),
    "warn": ("⚠️", "5447644880824181073"),
    "sparkle": ("✨", "5325547803936572038"),
    "chat": ("💬", "5443038326535759644"),
    # t.me/addemoji/RestrictedEmoji — second choice, only where the first pack has no match
    "person": ("👤", "5373012449597335010"),
    "calendar": ("🗓", "5413879192267805083"),
}


def pe(name: str) -> str:
    """HTML for one premium emoji, or the plain character when the name is unknown."""
    fallback, emoji_id = PREMIUM_EMOJI.get(name, ("", ""))
    if not emoji_id:
        return fallback
    return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>'


def pp(name: str) -> str:
    """The plain character of the same emoji: the twin of a message that carries no markup."""
    return PREMIUM_EMOJI.get(name, ("", ""))[0]
