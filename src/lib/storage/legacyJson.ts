// The JSON an older build left in the webview profile. Every module that moves that profile — the
// settings store, the legacy import, the sync ledgers — answers the same thing for a half-written or
// foreign value: "not there". This is that answer, once.
//
// Pure on purpose — no `localStorage`, no logger, no Tauri — so `node --test` reads the modules that
// use it as they are. What to say about a value that does not parse stays the caller's business: a
// migration that logs passes its warning in, one that stays quiet passes nothing.

/** A legacy value parsed once; `onInvalid` hears why it could not be. */
export function parseLegacyJson(raw: string, onInvalid?: (error: unknown) => void): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    onInvalid?.(error);
    return null;
  }
}
