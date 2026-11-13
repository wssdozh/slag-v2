// Desktop OS credential store for sync secrets. The webview never gets a plaintext copy on disk:
// the seed phrase, account token and device key are written straight into the platform store.
#[cfg(desktop)]
use keyring::Entry;

#[cfg(desktop)]
const SERVICE: &str = "com.slag.notes";
#[cfg(desktop)]
const MAX_KEY_LEN: usize = 200;

/// Keyring entries share the app's service name; reject anything that could truncate the
/// native call or turn into a different credential.
#[cfg(desktop)]
fn validate_secret_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > MAX_KEY_LEN || key.chars().any(|c| c.is_control()) {
        return Err("invalid secret key".into());
    }
    Ok(())
}

#[cfg(desktop)]
fn entry(key: &str) -> Result<Entry, String> {
    validate_secret_key(key)?;
    Entry::new(SERVICE, key).map_err(|error| format!("secure store unavailable: {error}"))
}

#[cfg(desktop)]
fn store_get(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("secure store read failed: {error}")),
    }
}

#[cfg(desktop)]
fn store_set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|error| format!("secure store write failed: {error}"))
}

#[cfg(desktop)]
fn store_delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("secure store delete failed: {error}")),
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn secret_get(key: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || store_get(&key))
        .await
        .map_err(|error| format!("secure store task failed: {error}"))?
}

#[cfg(desktop)]
#[tauri::command]
pub async fn secret_set(key: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || store_set(&key, &value))
        .await
        .map_err(|error| format!("secure store task failed: {error}"))?
}

#[cfg(desktop)]
#[tauri::command]
pub async fn secret_delete(key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || store_delete(&key))
        .await
        .map_err(|error| format!("secure store task failed: {error}"))?
}

#[cfg(all(test, desktop))]
mod tests {
    use super::{entry, store_delete, store_get, store_set, validate_secret_key};

    #[test]
    fn rejects_empty_oversized_and_control_keys() {
        assert!(validate_secret_key("vault-seed:default_vault").is_ok());
        assert!(validate_secret_key("").is_err());
        assert!(validate_secret_key("   ").is_err());
        assert!(validate_secret_key(&"a".repeat(201)).is_err());
        assert!(validate_secret_key("device\u{0}key").is_err());
        assert!(validate_secret_key("device\nkey").is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn round_trips_the_windows_credential_store() {
        let key = format!("__slag_test_{}", std::process::id());
        // A headless/restricted Windows runner may have no credential store; that is a
        // deployment fact, not a code failure. The desktop app falls back to the encrypted
        // local store in that case.
        if entry(&key).is_err() {
            return;
        }
        store_set(&key, "test-value").unwrap();
        assert_eq!(store_get(&key).unwrap().as_deref(), Some("test-value"));
        store_delete(&key).unwrap();
        assert_eq!(store_get(&key).unwrap(), None);
    }
}
