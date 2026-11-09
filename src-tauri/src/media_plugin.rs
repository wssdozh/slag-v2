use serde_json::Value;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, State};

/// A handle to the Kotlin side, so the picker can ask MediaStore for rows and thumbnails.
pub struct GalleryBridge(pub PluginHandle<tauri::Wry>);

/// App-local plugin: the commands themselves live in `MediaGalleryPlugin.kt`. Routing them
/// through an app command instead of `plugin:slag-media|…` keeps the webview off the plugin ACL,
/// which an app-local plugin has no way to declare.
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

#[tauri::command]
pub async fn gallery_ping(bridge: State<'_, GalleryBridge>) -> Result<Value, String> {
    bridge
        .0
        .run_mobile_plugin_async::<Value>("ping", ())
        .await
        .map_err(|error| error.to_string())
}
