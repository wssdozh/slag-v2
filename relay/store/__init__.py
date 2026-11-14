"""Хранилище релея: `RelayDatabase` собирается из миксинов, по одному на таблицу.

Тесты и `server.py` видят один класс с прежним именем — разложено только по файлам.
"""

from store.base import StoreBase
from store.bundles import BundlesMixin
from store.accounts import AccountsMixin
from store.pairing import PairingMixin
from store.vaults import VaultsMixin
from store.notify import NotifyMixin
from store.assistant import AssistantMixin


class RelayDatabase(StoreBase, BundlesMixin, AccountsMixin, PairingMixin,
                    VaultsMixin, NotifyMixin, AssistantMixin):
    """SQLite persistence; all account-era schema changes are additive."""
