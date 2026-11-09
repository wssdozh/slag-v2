use serde_json::{json, Value};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, State};

/// A handle to the Kotlin side, so the picker can ask MediaStore for rows.
pub struct GalleryBridge(pub PluginHandle<tauri::Wry>);

/// App-local plugin: the commands themselves live in `MediaGalleryPlugin.kt`. Routing them
/// through app commands instead of `plugin:slag-media|…` keeps the webview off the plugin ACL,
/// which an app-local plugin has no way to declare.
///
/// Only MediaStore *listing* lives here. Thumbnails and bytes go through `android-fs`, which
/// takes the same `content://` URI a row carries.
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("slag-media")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("com.slag.notes", "MediaGalleryPlugin")?;
                app.manage(GalleryBridge(handle));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}

async fn call(bridge: &GalleryBridge, command: &str, payload: Value) -> Result<Value, String> {
    bridge
        .0
        .run_mobile_plugin_async::<Value>(command, payload)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn gallery_access(bridge: State<'_, GalleryBridge>) -> Result<Value, String> {
    call(&bridge, "accessState", json!({})).await
}

#[tauri::command]
pub async fn gallery_request_access(bridge: State<'_, GalleryBridge>) -> Result<Value, String> {
    call(&bridge, "requestAccess", json!({})).await
}

#[tauri::command]
pub async fn gallery_list(
    bridge: State<'_, GalleryBridge>,
    kind: String,
    offset: u32,
    limit: u32,
) -> Result<Value, String> {
    call(&bridge, "listMedia", json!({ "kind": kind, "offset": offset, "limit": limit })).await
}
