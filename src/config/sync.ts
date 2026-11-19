// Sync defaults: relay URL, storage keys, retry and debounce timings, bundle size cap.
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
  // Capped at 15s: a question from the bot dies after 25s, and a socket that is dark for a
  // minute turns a live conversation into "устройство не ответило".
  RECONNECT_MAX_MS: 15000,
  RECONNECT_MAX_EXPONENT: 4,
  PAIRING_POLL_INTERVAL_MS: 2000,
  PAIRING_TIMEOUT_MS: 120000,
  DEFAULT_BG_SYNC_INTERVAL_MINUTES: 15,
  // Coalesce one burst of edits, not a whole second of typing.
  PUSH_DEBOUNCE_MS: 50,
  // Drafts change on every keystroke and must never drive the push rate.
  DRAFT_PUSH_DEBOUNCE_MS: 1000,
  // A websocket push not confirmed in this window is resent over HTTP.
  WS_ACK_TIMEOUT_MS: 2500,
  WS_PING_INTERVAL_MS: 25000,
  // A failed pass retries itself on this clock. Fixed, not a backoff: the user expects the
  // panel to come back to life within the same ten seconds they would wait before pressing
  // the refresh button themselves.
  RETRY_DELAY_MS: 10000,
  // A relay that accepts the connection and stalls the body must not hold a push forever.
  PUSH_TIMEOUT_MS: 30000,
  // The room's manifest is a few kilobytes; a slow answer is a dead answer.
  MANIFEST_TIMEOUT_MS: 8000,
  // After a confirmed push, one manifest round trip per burst is plenty: the relay's rows keep
  // only the latest root anyway, and an edit every second must not double the request rate.
  MANIFEST_CHECK_DEBOUNCE_MS: 800,
  // One look back after a full resend, so "sent it" becomes "it landed" without waiting for the
  // next edit. Longer than the push it is waiting on.
  MANIFEST_RECHECK_MS: 1500,
  // A device that edits nothing still has to notice a peer that fell behind: one check on this
  // slow clock while the connection is worth asking through.
  MANIFEST_HEARTBEAT_MS: 30000,
} as const;

/**
 * Attachment bytes ride the same encrypted bundle. One file per bundle: raw → data URL (1.33×)
 * → AES-GCM → base64 (1.33×) is ~1.78× on the wire, and the relay rejects bodies over 16 MB.
 */
export const SYNC_ATTACHMENT_MAX_BYTES = 6 * 1024 * 1024;

export const SYNC_CRYPTO_CONSTANTS = {
  VAULT_SALT: 'slag-vault-salt-v1',
  ROOM_SALT: 'slag-relay-room-v1',
  ACCOUNT_KEY_DOMAIN: 'slag-account-identity-v1',
  HKDF_SALT: 'slag-account-device-v1',
  HKDF_INFO: 'slag-vault-key-v1',
} as const;
