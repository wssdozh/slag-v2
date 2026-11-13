//! `slag://` links: a note opened from Telegram, a browser, or any other app that can hand a
//! URL to the system.
//!
//! The URL always reaches the webview the same way. It is parked natively, the frontend is told
//! that something arrived, and the frontend pulls it with one command. Parking instead of
//! pushing matters for the cold start: when the link *is* the launch argument there is no
//! listener yet, and a pushed payload would be lost.

/// Fired when a link arrives. Carries nothing on purpose: one pull path, no ordering to guess.
pub const OPEN_EVENT: &str = "slag://open-link";

/// Whether one command-line argument (or an Android intent) is a link this app handles.
pub fn is_deep_link(arg: &str) -> bool {
    arg.starts_with("slag://")
}

/// The first `slag://` argument of a launch, if this launch had one.
pub fn link_in_args<S: AsRef<str>>(args: &[S]) -> Option<String> {
    args.iter()
        .map(|arg| arg.as_ref())
        .find(|arg| is_deep_link(arg))
        .map(|arg| arg.to_string())
}

#[cfg(desktop)]
pub use desktop::{deliver, register_scheme, PendingLink};

/// Hands the parked URL to the webview, once: a second call finds an empty slot.
#[cfg(desktop)]
#[tauri::command]
pub fn take_deep_link(state: tauri::State<'_, PendingLink>) -> Option<String> {
    state.0.lock().ok().and_then(|mut slot| slot.take())
}

#[cfg(desktop)]
mod desktop {
    use std::sync::Mutex;

    use tauri::{AppHandle, Emitter, Manager};

    /// The one slot a URL waits in. Newest wins: a person who taps twice wants the second note.
    #[derive(Default)]
    pub struct PendingLink(pub Mutex<Option<String>>);

    /// Parks the URL and nudges the webview; the URL itself travels through `take_deep_link`.
    pub fn deliver(app: &AppHandle, url: &str) {
        if let Some(state) = app.try_state::<PendingLink>() {
            if let Ok(mut slot) = state.0.lock() {
                *slot = Some(url.to_string());
            }
        }
        let _ = app.emit(super::OPEN_EVENT, ());
    }

    /// Teaches the OS that `slag://` belongs to this app.
    ///
    /// Runs on every start, but writes only when something is missing: the check is one cheap
    /// query, and rewriting the registration each launch would turn a fast start into a slow one.
    pub fn register_scheme() {
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        let exe = exe.to_string_lossy().to_string();
        #[cfg(target_os = "windows")]
        register_windows(&exe);
        #[cfg(target_os = "linux")]
        register_linux(&exe);
        #[cfg(target_os = "macos")]
        {
            let _ = exe;
        }
    }

    /// `HKCU\Software\Classes\slag` is the per-user form of a URL protocol handler: no admin
    /// rights, no installer run, and it disappears with the user profile.
    #[cfg(target_os = "windows")]
    fn register_windows(exe: &str) {
        use std::process::Command;

        const KEY: &str = r"HKCU\Software\Classes\slag";
        let registered = Command::new("reg")
            .args(["query", KEY])
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false);
        if registered {
            return;
        }
        let command_key = format!(r"{KEY}\shell\open\command");
        for args in [
            vec!["add", KEY, "/ve", "/d", "URL:SLAG notes", "/f"],
            vec!["add", KEY, "/v", "URL Protocol", "/d", "", "/f"],
            vec!["add", &command_key, "/ve", "/d", &format!("\"{exe}\" \"%1\""), "/f"],
        ] {
            let _ = Command::new("reg").args(args).output();
        }
    }

    /// A user-level `.desktop` entry plus `xdg-mime`, which is what every desktop reads when a
    /// link is opened. `NoDisplay` keeps it out of the application menu: it is a handler, not an
    /// app to launch.
    #[cfg(target_os = "linux")]
    fn register_linux(exe: &str) {
        use std::process::Command;

        const DESKTOP_FILE: &str = "slag-notes.desktop";
        let Some(home) = std::env::var_os("HOME") else {
            return;
        };
        let dir = std::path::PathBuf::from(home).join(".local/share/applications");
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let path = dir.join(DESKTOP_FILE);
        let body = format!(
            "[Desktop Entry]\nType=Application\nName=SLAG\nExec=\"{exe}\" %u\nNoDisplay=true\nTerminal=false\nMimeType=x-scheme-handler/slag;\nCategories=Utility;\n"
        );
        if std::fs::read_to_string(&path).ok().as_deref() != Some(body.as_str())
            && std::fs::write(&path, &body).is_err()
        {
            return;
        }
        let current = Command::new("xdg-mime")
            .args(["query", "default", "x-scheme-handler/slag"])
            .output()
            .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
            .unwrap_or_default();
        if current == DESKTOP_FILE {
            return;
        }
        let _ = Command::new("xdg-mime")
            .args(["default", DESKTOP_FILE, "x-scheme-handler/slag"])
            .output();
    }
}

#[cfg(target_os = "android")]
pub use android::{init, LinkBridge};

/// Asks Kotlin for the link it is holding, if any. The intent is parked there because a resumed
/// activity receives it long after `setup` has run.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn take_deep_link(bridge: tauri::State<'_, LinkBridge>) -> Result<Option<String>, String> {
    android::ask(bridge.inner()).await
}

#[cfg(target_os = "android")]
mod android {
    use serde_json::{json, Value};
    use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
    use tauri::{Manager, Wry};

    /// A handle to the Kotlin side, which is the only one that ever sees the intent.
    pub struct LinkBridge(pub PluginHandle<Wry>);

    /// App-local plugin, same shape as `media_plugin`: the commands live in Kotlin and are
    /// reached through app commands, so the webview never needs an ACL the plugin cannot declare.
    pub fn init() -> TauriPlugin<Wry> {
        Builder::new("slag-deeplink")
            .setup(|app, api| {
                let handle = api.register_android_plugin("com.slag.notes", "DeepLinkPlugin")?;
                app.manage(LinkBridge(handle));
                Ok(())
            })
            .build()
    }

    pub async fn ask(bridge: &LinkBridge) -> Result<Option<String>, String> {
        let answer: Value = bridge
            .0
            .run_mobile_plugin_async("take", json!({}))
            .await
            .map_err(|error| error.to_string())?;
        Ok(answer
            .get("url")
            .and_then(|value| value.as_str())
            .map(|url| url.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_link_is_recognised_only_by_its_scheme() {
        assert!(is_deep_link("slag://note?title=x"));
        assert!(!is_deep_link("--quick"));
        assert!(!is_deep_link("/usr/bin/slag-v2"));
    }

    #[test]
    fn the_first_link_argument_wins() {
        let args = ["/app/slag-v2", "--autostart", "slag://note/Первая", "slag://note/Вторая"];
        assert_eq!(link_in_args(&args).as_deref(), Some("slag://note/Первая"));
        assert_eq!(link_in_args(&["/app/slag-v2", "--quick"]), None);
    }
}
