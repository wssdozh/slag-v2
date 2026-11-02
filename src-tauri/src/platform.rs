use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

const SLAG_BINDING_PATH: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/slag-quick-composer/";
const SLAG_ICON_BYTES: &[u8] = include_bytes!("../icons/128x128.png");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: String,
    pub session_type: String,
    pub desktop_environment: String,
    pub is_wayland: bool,
    pub is_gnome: bool,
    pub hotkey_backend: String,
    pub is_hotkey_registered: bool,
    pub executable_path: String,
    pub shortcut: String,
    pub details: String,
}

#[cfg(target_os = "linux")]
fn run_cmd(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute {program}: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{program} error: {stderr}"));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn parse_gsettings_string_array(raw: &str) -> Vec<String> {
    let mut items = Vec::new();
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\'' || chars[i] == '"' {
            let quote = chars[i];
            i += 1;
            let start = i;
            while i < chars.len() && chars[i] != quote {
                i += 1;
            }
            if i <= chars.len() {
                let s: String = chars[start..i].iter().collect();
                if !s.is_empty() {
                    items.push(s);
                }
            }
        }
        i += 1;
    }
    items
}

#[cfg(target_os = "linux")]
fn detect_linux_session_type() -> String {
    if let Ok(val) = std::env::var("XDG_SESSION_TYPE") {
        let v = val.trim().to_lowercase();
        if v == "wayland" || v == "x11" {
            return v;
        }
    }
    if std::env::var("WAYLAND_DISPLAY").is_ok() {
        return "wayland".to_string();
    }
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        if std::path::Path::new(&runtime_dir).join("wayland-0").exists() {
            return "wayland".to_string();
        }
    }
    if std::env::var("DISPLAY").is_ok() {
        return "x11".to_string();
    }
    "wayland".to_string()
}

#[cfg(target_os = "linux")]
fn detect_linux_desktop_env() -> String {
    if let Ok(val) = std::env::var("XDG_CURRENT_DESKTOP") {
        let lower = val.to_lowercase();
        if lower.contains("gnome") {
            return "gnome".to_string();
        } else if lower.contains("kde") || lower.contains("plasma") {
            return "kde".to_string();
        } else if lower.contains("hyprland") {
            return "hyprland".to_string();
        } else if lower.contains("sway") {
            return "sway".to_string();
        } else if lower.contains("xfce") {
            return "xfce".to_string();
        }
    }
    if let Ok(val) = std::env::var("DESKTOP_SESSION") {
        let lower = val.to_lowercase();
        if lower.contains("gnome") {
            return "gnome".to_string();
        } else if lower.contains("plasma") || lower.contains("kde") {
            return "kde".to_string();
        }
    }
    let check = Command::new("gsettings")
        .args(["list-schemas"])
        .output();
    if let Ok(out) = check {
        let text = String::from_utf8_lossy(&out.stdout);
        if text.contains("org.gnome.settings-daemon.plugins.media-keys") {
            return "gnome".to_string();
        }
    }
    "unknown".to_string()
}

#[cfg(target_os = "linux")]
pub fn is_gnome_shortcut_installed(expected_exe: &str) -> bool {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings"])
        .output();
    let Ok(out) = output else { return false; };
    if !out.status.success() { return false; }
    let text = String::from_utf8_lossy(&out.stdout);
    if !text.contains(SLAG_BINDING_PATH) {
        return false;
    }

    let cmd_output = Command::new("gsettings")
        .args([
            "get",
            &format!("org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:{}", SLAG_BINDING_PATH),
            "command",
        ])
        .output();
    let Ok(cmd_out) = cmd_output else { return false; };
    if !cmd_out.status.success() { return false; }
    let cmd_text = String::from_utf8_lossy(&cmd_out.stdout);
    cmd_text.contains(expected_exe) && cmd_text.contains("--quick")
}

#[cfg(target_os = "linux")]
pub fn install_gnome_shortcut(binding: Option<&str>) -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {e}"))?;
    let exe_str = exe_path.to_string_lossy();
    let exec_cmd = format!("{exe_str} --quick");
    let key_binding = binding.unwrap_or("<Control><Shift>space");

    let reloc_schema = format!("org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:{}", SLAG_BINDING_PATH);

    run_cmd("gsettings", &["set", &reloc_schema, "name", "SLAG — Быстрая мысль"])?;
    run_cmd("gsettings", &["set", &reloc_schema, "command", &exec_cmd])?;
    run_cmd("gsettings", &["set", &reloc_schema, "binding", key_binding])?;

    let list_output = Command::new("gsettings")
        .args(["get", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings"])
        .output()
        .map_err(|e| format!("Failed to read custom-keybindings: {e}"))?;

    let raw_list = String::from_utf8_lossy(&list_output.stdout);
    let mut items = parse_gsettings_string_array(&raw_list);
    if !items.iter().any(|item| item == SLAG_BINDING_PATH) {
        items.push(SLAG_BINDING_PATH.to_string());
    }

    let formatted_list = if items.is_empty() {
        "@as []".to_string()
    } else {
        format!("[{}]", items.iter().map(|s| format!("'{}'", s)).collect::<Vec<_>>().join(", "))
    };

    run_cmd("gsettings", &["set", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings", &formatted_list])?;

    Ok(())
}

#[cfg(target_os = "linux")]
pub fn remove_gnome_shortcut() -> Result<(), String> {
    let reloc_schema = format!("org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:{}", SLAG_BINDING_PATH);
    let _ = Command::new("gsettings").args(["reset", &reloc_schema, "name"]).output();
    let _ = Command::new("gsettings").args(["reset", &reloc_schema, "command"]).output();
    let _ = Command::new("gsettings").args(["reset", &reloc_schema, "binding"]).output();

    let list_output = Command::new("gsettings")
        .args(["get", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings"])
        .output()
        .map_err(|e| format!("Failed to read custom-keybindings: {e}"))?;

    let raw_list = String::from_utf8_lossy(&list_output.stdout);
    let items: Vec<String> = parse_gsettings_string_array(&raw_list)
        .into_iter()
        .filter(|item| item != SLAG_BINDING_PATH)
        .collect();

    let formatted_list = if items.is_empty() {
        "@as []".to_string()
    } else {
        format!("[{}]", items.iter().map(|s| format!("'{}'", s)).collect::<Vec<_>>().join(", "))
    };

    run_cmd("gsettings", &["set", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings", &formatted_list])?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn ensure_desktop_entry() -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "HOME environment variable not set".to_string())?;
    let data_home = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(&home).join(".local/share"));

    let app_dir = data_home.join("applications");
    let icons_dir = data_home.join("icons/hicolor/128x128/apps");
    let _ = std::fs::create_dir_all(&app_dir);
    let _ = std::fs::create_dir_all(&icons_dir);

    let icon_path = icons_dir.join("com.slag.notes.png");
    let _ = std::fs::write(&icon_path, SLAG_ICON_BYTES);

    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {e}"))?;
    let exe_str = exe_path.to_string_lossy();

    let desktop_content = format!(
r#"[Desktop Entry]
Name=SLAG
Comment=Ultra-minimalist local-first notes & tasks
Exec="{exe_str}" %U
Icon=com.slag.notes
Terminal=false
Type=Application
Categories=Office;Utility;
StartupWMClass=slag-v2
Actions=QuickComposer;

[Desktop Action QuickComposer]
Name=Быстрая мысль
Exec="{exe_str}" --quick
"#);

    let desktop_file = app_dir.join("com.slag.notes.desktop");
    std::fs::write(&desktop_file, desktop_content)
        .map_err(|e| format!("Failed to write desktop entry: {e}"))?;

    let _ = Command::new("update-desktop-database").arg(&app_dir).status();

    Ok(())
}

pub fn detect_platform() -> PlatformInfo {
    let os = if cfg!(target_os = "linux") {
        "linux".to_string()
    } else if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "unknown".to_string()
    };

    let exe_path = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    #[cfg(target_os = "linux")]
    {
        let session_type = detect_linux_session_type();
        let desktop_environment = detect_linux_desktop_env();
        let is_wayland = session_type == "wayland";
        let is_gnome = desktop_environment.contains("gnome");

        let (hotkey_backend, is_registered, details) = if is_gnome {
            let registered = is_gnome_shortcut_installed(&exe_path);
            (
                "gnome_gsettings".to_string(),
                registered,
                if registered {
                    "Активен через GNOME Media Keys (глобальный перехват Wayland)".to_string()
                } else {
                    "Доступен для автоматической привязки через GNOME Media Keys".to_string()
                },
            )
        } else if is_wayland {
            (
                "custom_launcher".to_string(),
                false,
                format!("Wayland ({desktop_environment}): привяжите команду '{exe_path} --quick' в настройках вашего WM"),
            )
        } else {
            (
                "tauri_native".to_string(),
                true,
                "X11: активен нативный перехватчик Tauri".to_string(),
            )
        };

        PlatformInfo {
            os,
            session_type,
            desktop_environment,
            is_wayland,
            is_gnome,
            hotkey_backend,
            is_hotkey_registered: is_registered,
            executable_path: exe_path,
            shortcut: "Ctrl+Shift+Space".to_string(),
            details,
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        PlatformInfo {
            os: os.clone(),
            session_type: "native".to_string(),
            desktop_environment: os,
            is_wayland: false,
            is_gnome: false,
            hotkey_backend: "tauri_native".to_string(),
            is_hotkey_registered: true,
            executable_path: exe_path,
            shortcut: "Ctrl+Shift+Space".to_string(),
            details: "Нативный системный глобальный перехватчик активен".to_string(),
        }
    }
}

pub fn auto_adapt_system() {
    #[cfg(target_os = "linux")]
    {
        let info = detect_platform();
        if info.is_gnome {
            let _ = ensure_desktop_entry();
            if !info.is_hotkey_registered {
                let _ = install_gnome_shortcut(None);
            }
        }
    }
}
