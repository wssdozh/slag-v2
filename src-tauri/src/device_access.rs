// The Android grants a reminder needs that are not runtime permissions: draw over other apps,
// full-screen alarm intents, and whether the OS will show notifications at all. Every one of the
// three can only be flipped in system settings, so this module reads the state and opens that
// screen — it never asks the OS for anything itself.
use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAccessStatus {
    /// `Settings.canDrawOverlays`: a reminder can appear over another app.
    pub overlay: bool,
    /// `areNotificationsEnabled`: the OS will post this app's notifications.
    pub notifications: bool,
    /// Android 14+ `canUseFullScreenIntent`; true on every older release, which had no switch.
    pub full_screen_intent: bool,
}

/// Android reads the three switches and `PackageManager.canRequestPackageInstalls` through the
/// Kotlin bridge. Desktop has none of them, so its command reports "unknown" instead of inventing
/// a state the UI would then have to hide.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn device_access_status(app: tauri::AppHandle) -> Result<DeviceAccessStatus, String> {
    android::status(&app).await
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn device_access_status() -> Result<Option<DeviceAccessStatus>, String> {
    Ok(None)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn device_access_open(app: tauri::AppHandle, target: String) -> Result<(), String> {
    android::open(&app, &target).await
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn device_access_open(target: String) -> Result<(), String> {
    let _ = target;
    Err("unsupported".to_string())
}

#[cfg(target_os = "android")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    android::init()
}

/// `can_install_packages` for [`crate::updater::update_platform`]: the apk path already goes
/// through `ApkInstallerPlugin`, so the value comes from the same PackageManager call.
#[cfg(target_os = "android")]
pub async fn can_install_packages(app: &tauri::AppHandle) -> Option<bool> {
    android::can_install(app).await
}

#[cfg(target_os = "android")]
mod android {
    use super::DeviceAccessStatus;
    use serde_json::{json, Value};
    use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
    use tauri::{AppHandle, Manager};

    pub struct DeviceAccessBridge(pub PluginHandle<tauri::Wry>);

    /// App-local plugin: the commands live in `DeviceAccessPlugin.kt`. Routing them through app
    /// commands keeps the webview away from the plugin ACL, which an app-local plugin cannot
    /// declare itself — the same arrangement as `slag-updater` and `slag-media`.
    pub fn init() -> TauriPlugin<tauri::Wry> {
        Builder::new("slag-device-access")
            .setup(|app, api| {
                let handle = api.register_android_plugin("com.slag.notes", "DeviceAccessPlugin")?;
                app.manage(DeviceAccessBridge(handle));
                Ok(())
            })
            .build()
    }

    async fn call(app: &AppHandle, command: &str, payload: Value) -> Result<Value, String> {
        let bridge = app.state::<DeviceAccessBridge>();
        bridge
            .0
            .run_mobile_plugin_async::<Value>(command, payload)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn status(app: &AppHandle) -> Result<DeviceAccessStatus, String> {
        let value = call(app, "status", json!({})).await?;
        Ok(DeviceAccessStatus {
            overlay: value.get("overlay").and_then(Value::as_bool).unwrap_or(false),
            notifications: value.get("notifications").and_then(Value::as_bool).unwrap_or(false),
            full_screen_intent: value
                .get("fullScreenIntent")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        })
    }

    pub async fn open(app: &AppHandle, target: &str) -> Result<(), String> {
        call(app, "open", json!({ "target": target }))
            .await
            .map(|_| ())
    }

    pub async fn can_install(app: &AppHandle) -> Option<bool> {
        call(app, "canInstall", json!({}))
            .await
            .ok()?
            .get("canInstall")?
            .as_bool()
    }
}
