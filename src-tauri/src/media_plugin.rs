use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

/// App-local plugin whose commands live in Kotlin (`MediaGalleryPlugin`): MediaStore queries and
/// thumbnail extraction are only reachable from the Android side, and the picker's grid asks for
/// them through `plugin:slag-media|…`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("slag-media")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            api.register_android_plugin("com.slag.notes", "MediaGalleryPlugin")?;
            Ok(())
        })
        .build()
}
