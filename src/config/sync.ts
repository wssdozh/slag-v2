export const DEFAULT_SYNC_SERVER_URL = 'http://152.53.199.71:8320';

export const OFFICIAL_SYNC_DOMAINS = ['152.53.199.71', 'slag.app'] as const;

export const SYNC_STORAGE_KEYS = {
  SYNC_CONFIG: 'slag_sync_config_v2',
  LAST_STATE_HASH: 'slag_sync_last_state_hash',
  ACCOUNT_SESSION: 'slag_account_session_v1',
  DEVICE_KEY_PREFIX: 'slag_account_device_v1:',
  DRAFT_TOMB_PREFIX: 'slag_sync_draft_tomb_',
} as const;

export const SYNC_INTERVALS = {
  POLL_INTERVAL_MS: 5000,
  HEALTH_TIMEOUT_MS: 5000,
  RECONNECT_BASE_MS: 5000,
  RECONNECT_MAX_MS: 60000,
  RECONNECT_MAX_EXPONENT: 4,
  PAIRING_POLL_INTERVAL_MS: 2000,
  PAIRING_TIMEOUT_MS: 120000,
  DEFAULT_BG_SYNC_INTERVAL_MINUTES: 15,
  PUSH_DEBOUNCE_MS: 400,
  WS_PING_INTERVAL_MS: 30000,
} as const;

export const SYNC_CRYPTO_CONSTANTS = {
  VAULT_SALT: 'slag-vault-salt-v1',
  ROOM_SALT: 'slag-relay-room-v1',
  ACCOUNT_KEY_DOMAIN: 'slag-account-identity-v1',
  HKDF_SALT: 'slag-account-device-v1',
  HKDF_INFO: 'slag-vault-key-v1',
} as const;
