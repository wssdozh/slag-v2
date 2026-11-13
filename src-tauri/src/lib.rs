#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
#[allow(unused_imports)]
use tauri::{Emitter, Manager, WindowEvent};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "windows")]
#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: *mut std::ffi::c_void,
        dw_attribute: u32,
        pv_attribute: *const std::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
    fn SetProcessWorkingSetSize(
        hProcess: *mut std::ffi::c_void,
        dwMinimumWorkingSetSize: usize,
        dwMaximumWorkingSetSize: usize,
    ) -> i32;
    fn GetCurrentProcess() -> *mut std::ffi::c_void;
    fn GetCurrentProcessId() -> u32;
    fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> *mut std::ffi::c_void;
    fn Process32FirstW(hSnapshot: *mut std::ffi::c_void, lppe: *mut PROCESSENTRY32W) -> i32;
    fn Process32NextW(hSnapshot: *mut std::ffi::c_void, lppe: *mut PROCESSENTRY32W) -> i32;
    fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct PROCESSENTRY32W {
    dw_size: u32,
    cnt_usage: u32,
    th32_process_id: u32,
    th32_default_heap_id: usize,
    th32_module_id: u32,
    cnt_threads: u32,
    th32_parent_process_id: u32,
    pc_pri_class_base: i32,
    dw_flags: u32,
    sz_exe_file: [u16; 260],
}

#[cfg(target_os = "windows")]
pub fn trim_working_set() {
    unsafe {
        // Trim our own main process
        let _ = SetProcessWorkingSetSize(GetCurrentProcess(), usize::MAX, usize::MAX);

        // Enumerate and trim all child WebView2 helper processes
        // TH32CS_SNAPPROCESS = 0x00000002
        let snapshot = CreateToolhelp32Snapshot(0x00000002, 0);
        let invalid_handle = -1isize as *mut std::ffi::c_void;
        if snapshot != invalid_handle && !snapshot.is_null() {
            let my_pid = GetCurrentProcessId();
            let mut entry = std::mem::zeroed::<PROCESSENTRY32W>();
            entry.dw_size = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    if entry.th32_parent_process_id == my_pid {
                        // PROCESS_SET_QUOTA (0x0100) | PROCESS_QUERY_INFORMATION (0x0400)
                        let child = OpenProcess(0x0100 | 0x0400, 0, entry.th32_process_id);
                        if !child.is_null() {
                            let _ = SetProcessWorkingSetSize(child, usize::MAX, usize::MAX);
                            let _ = CloseHandle(child);
                        }
                    }
                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }
}

#[cfg(target_os = "windows")]
pub fn set_webview_memory_level(window: &tauri::WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        ICoreWebView2_19,
    };
    use windows_core::Interface;

    let _ = window.with_webview(move |wv| {
        unsafe {
            let controller = wv.controller();
            if let Ok(core_webview) = controller.CoreWebView2() {
                if let Ok(webview_19) = core_webview.cast::<ICoreWebView2_19>() {
                    let level = if low {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                    } else {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                    };
                    let _ = webview_19.SetMemoryUsageTargetLevel(level);
                }
            }
        }
    });
}

#[cfg(target_os = "windows")]
fn configure_window_border(window: &tauri::Window) {
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            // DWMWA_BORDER_COLOR = 34
            // DWMWA_COLOR_NONE = 0xFFFFFFFE (disables window border entirely on Windows 11)
            let border_color: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(
                hwnd.0 as *mut std::ffi::c_void,
                34,
                &border_color as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );

            // For quick-composer, disable native DWM rounding/shadows so only the transparent webview shape shows
            if window.label() == "quick-composer" {
                // DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_DONOTROUND = 1
                let corner_pref: u32 = 1;
                let _ = DwmSetWindowAttribute(
                    hwnd.0 as *mut std::ffi::c_void,
                    33,
                    &corner_pref as *const u32 as *const std::ffi::c_void,
                    std::mem::size_of::<u32>() as u32,
                );
                return;
            }

            // DWMWA_USE_IMMERSIVE_DARK_MODE = 20
            let dark_mode: i32 = 1;
            let _ = DwmSetWindowAttribute(
                hwnd.0 as *mut std::ffi::c_void,
                20,
                &dark_mode as *const i32 as *const std::ffi::c_void,
                std::mem::size_of::<i32>() as u32,
            );

            // DWMWA_BORDER_COLOR = 34
            // DWMWA_COLOR_NONE = 0xFFFFFFFE (disables window border entirely on Windows 11)
            let border_color: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(
                hwnd.0 as *mut std::ffi::c_void,
                34,
                &border_color as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );

            // DWMWA_WINDOW_CORNER_PREFERENCE = 33
            // DWMWCP_ROUND = 2 (standard Windows 11 rounded corners)
            let corner_preference: u32 = 2;
            let _ = DwmSetWindowAttribute(
                hwnd.0 as *mut std::ffi::c_void,
                33,
                &corner_preference as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn configure_window_border(_window: &tauri::Window) {}

mod platform;
#[cfg(desktop)]
mod secure_store;
#[cfg(target_os = "android")]
mod media_plugin;

#[cfg(desktop)]
#[tauri::command]
fn get_platform_info() -> Result<platform::PlatformInfo, String> {
    Ok(platform::detect_platform())
}

#[cfg(desktop)]
#[tauri::command]
fn setup_system_hotkey(binding: Option<String>) -> Result<platform::PlatformInfo, String> {
    #[cfg(target_os = "linux")]
    {
        platform::install_gnome_shortcut(binding.as_deref())?;
        let _ = platform::ensure_desktop_entry();
    }
    Ok(platform::detect_platform())
}

#[cfg(desktop)]
#[tauri::command]
fn remove_system_hotkey() -> Result<platform::PlatformInfo, String> {
    #[cfg(target_os = "linux")]
    {
        platform::remove_gnome_shortcut()?;
    }
    Ok(platform::detect_platform())
}

#[cfg(desktop)]
fn resolve_open_target(base: &std::path::Path, target: &str) -> Result<(std::path::PathBuf, bool), String> {
    use std::path::PathBuf;

    // NUL would truncate the path in the OS call; control characters have no business here.
    if target.contains('\0') || target.chars().any(|c| c.is_control()) {
        return Err("invalid target".into());
    }

    let normalized = target.trim().replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.starts_with('~')
        || normalized.as_bytes().get(1) == Some(&b':')
    {
        return Err("invalid target".into());
    }

    let mut path: PathBuf = base.to_path_buf();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return Err("invalid target".into());
        }
        if part.contains(':') {
            return Err("invalid target".into());
        }
        path.push(part);
    }

    Ok((path, normalized.ends_with(".md")))
}

#[cfg(desktop)]
#[tauri::command]
fn open_in_folder(app: tauri::AppHandle, target: String) -> Result<String, String> {
    let base_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (target_path, is_file) = match target.as_str() {
        "logs" => (base_dir.join("logs"), false),
        "notes" => (base_dir.join("vaults").join("main").join("notes"), false),
        other => resolve_open_target(&base_dir, other)?,
    };

    if is_file {
        if let Some(parent) = target_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    } else {
        let _ = std::fs::create_dir_all(&target_path);
    }

    // `..` is already rejected, but a symlink inside app data must not widen the target
    // either. Canonicalize the directory that will actually be opened.
    let canonical_base = std::fs::canonicalize(&base_dir).map_err(|e| e.to_string())?;
    let check_path = if is_file {
        target_path.parent().unwrap_or(&base_dir)
    } else {
        &target_path
    };
    let canonical_target = std::fs::canonicalize(check_path).map_err(|e| e.to_string())?;
    if !canonical_target.starts_with(&canonical_base) {
        return Err("invalid target".into());
    }

    #[cfg(target_os = "windows")]
    {
        let win_path = target_path.to_string_lossy().replace('/', "\\");
        let mut cmd = std::process::Command::new("explorer");
        if is_file && target_path.exists() {
            cmd.arg(format!("/select,{}", win_path));
        } else {
            cmd.arg(&win_path);
        }
        cmd.spawn().map_err(|e| e.to_string())?;
        Ok(win_path)
    }
    #[cfg(target_os = "macos")]
    {
        if is_file && target_path.exists() {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&target_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("open")
                .arg(&target_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(target_path.to_string_lossy().to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let open_target = if is_file {
            target_path.parent().unwrap_or(&target_path)
        } else {
            &target_path
        };
        std::process::Command::new("xdg-open")
            .arg(open_target)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(target_path.to_string_lossy().to_string())
    }
}

#[cfg(target_os = "linux")]
const LINUX_APP_ID: &str = "com.slag.notes";

/// WebKitGTK's DMA-BUF path repaints the frameless window's corner with a stale
/// buffer on Mesa, which shows up as a flicker. Keep the stable shared-memory
/// renderer unless the environment already pins a value.
#[cfg(target_os = "linux")]
fn use_stable_renderer() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// Brings the main window forward, changing visibility only when necessary.
#[cfg(desktop)]
fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
        #[cfg(target_os = "linux")]
        {
            let handle = window.clone();
            let _ = window.run_on_main_thread(move || {
                use gtk::prelude::GtkWindowExt;
                if let Ok(native) = handle.gtk_window() {
                    native.present();
                }
            });
        }
        #[cfg(not(target_os = "linux"))]
        let _ = window.set_focus();
        #[cfg(target_os = "windows")]
        set_webview_memory_level(&window, false);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Both settings must land before GTK/WebKit start, so they stay first in run().
        use_stable_renderer();
        // GNOME ties a Wayland window to its launcher by app_id, and GTK derives app_id from
        // the program name (the binary name by default). With a binary name the dock never
        // shows SLAG as running, so the launcher looks "not open" and starts an extra process.
        glib::set_prgname(Some(LINUX_APP_ID));
    }

    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--install-system") {
        #[cfg(target_os = "linux")]
        {
            if let Err(e) = platform::ensure_desktop_entry() {
                eprintln!("Failed to install desktop entry: {e}");
            }
            if let Err(e) = platform::install_gnome_shortcut(None) {
                eprintln!("Failed to install GNOME shortcut: {e}");
            } else {
                println!("SLAG system integration installed successfully.");
            }
            return;
        }
    }
    if args.iter().any(|a| a == "--uninstall-system") {
        #[cfg(target_os = "linux")]
        {
            if let Err(e) = platform::remove_gnome_shortcut() {
                eprintln!("Failed to remove GNOME shortcut: {e}");
            } else {
                println!("SLAG system integration uninstalled successfully.");
            }
            return;
        }
    }

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            open_in_folder,
            get_platform_info,
            setup_system_hotkey,
            remove_system_hotkey,
            secure_store::secret_get,
            secure_store::secret_set,
            secure_store::secret_delete
        ]);
    }

    #[cfg(target_os = "android")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            media_plugin::gallery_access,
            media_plugin::gallery_request_access,
            media_plugin::gallery_list
        ]);
    }

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                let is_quick = args.iter().any(|arg| arg == "--quick" || arg == "--composer" || arg == "-q");
                if is_quick {
                    if let Some(quick_win) = app.get_webview_window("quick-composer") {
                        let _ = quick_win.show();
                        let _ = quick_win.unminimize();
                        let _ = quick_win.set_focus();
                        #[cfg(target_os = "windows")]
                        set_webview_memory_level(&quick_win, false);
                        let _ = quick_win.emit("slag://focus-composer", ());
                        return;
                    }
                }
                reveal_main_window(app);
            }))
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_denylist(&["quick-composer"])
                    // Visibility is owned by the tray + single-instance flow: persisting it
                    // would let a hidden window restore as "should not be shown".
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::SIZE
                            | tauri_plugin_window_state::StateFlags::POSITION
                            | tauri_plugin_window_state::StateFlags::MAXIMIZED
                            | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                    )
                    .build(),
            )
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            if let Some(quick_win) = app.get_webview_window("quick-composer") {
                                let _ = quick_win.show();
                                let _ = quick_win.unminimize();
                                let _ = quick_win.set_focus();
                                #[cfg(target_os = "windows")]
                                set_webview_memory_level(&quick_win, false);
                                let _ = quick_win.emit("slag://focus-composer", ());
                            } else {
                                reveal_main_window(app);
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.emit("slag://open-composer", ());
                                }
                            }
                        }
                    })
                    .build(),
            );
    }

    builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_android_fs::init());

    // MediaStore listing only exists on Android; the module is compiled there and nowhere else.
    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(media_plugin::init());
    }

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.on_window_event(|window, _event| {
            configure_window_border(window);
        });
    }

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                platform::auto_adapt_system();

                if let Some(main_window) = app.get_webview_window("main") {
                    #[cfg(target_os = "windows")]
                    configure_window_border(&main_window.as_ref().window());
                    let win = main_window.clone();
                    main_window.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win.hide();
                            #[cfg(target_os = "windows")]
                            {
                                set_webview_memory_level(&win, true);
                                trim_working_set();
                            }
                        }
                    });
                }

                // The window starts hidden so the restored geometry is applied before the
                // first frame; showing it earlier makes the layout jump (sidebar resize).
                if !std::env::args().any(|a| a == "--quick" || a == "-q" || a == "--composer") {
                    reveal_main_window(app.handle());
                }

                if let Some(quick_window) = app.get_webview_window("quick-composer") {
                    let qwin = quick_window.clone();
                    quick_window.on_window_event(move |event| {
                        match event {
                            WindowEvent::CloseRequested { api, .. } => {
                                api.prevent_close();
                                let _ = qwin.hide();
                            }
                            WindowEvent::Focused(focused) => {
                                if !focused {
                                    let _ = qwin.hide();
                                }
                            }
                            _ => {}
                        }
                    });
                }

                let is_cold_quick = std::env::args().any(|a| a == "--quick" || a == "-q" || a == "--composer");
                if is_cold_quick {
                    if let Some(main_win) = app.get_webview_window("main") {
                        let _ = main_win.hide();
                    }
                    if let Some(quick_win) = app.get_webview_window("quick-composer") {
                        let _ = quick_win.show();
                        let _ = quick_win.unminimize();
                        let _ = quick_win.set_focus();
                        let _ = quick_win.emit("slag://focus-composer", ());
                    }
                }

                // Register global hotkey: Ctrl + Shift + Space
                let hotkey = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::Space,
                );
                if let Err(err) = app.global_shortcut().register(hotkey) {
                    eprintln!("Failed to register global shortcut: {:?}", err);
                }

                // Setup System Tray
                let open_item = MenuItemBuilder::with_id("open", "Открыть SLAG").build(app)?;
                let composer_item = MenuItemBuilder::with_id(
                    "quick_note",
                    "Быстрая мысль (Ctrl+Shift+Space)",
                )
                .build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "Выход").build(app)?;

                let menu = MenuBuilder::new(app)
                    .item(&open_item)
                    .item(&composer_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                    .ok()
                    .or_else(|| app.default_window_icon().cloned());

                if let Some(icon) = tray_icon {
                    let _tray = TrayIconBuilder::new()
                        .icon(icon)
                        .icon_as_template(true)
                        .tooltip("SLAG v2")
                        .menu(&menu)
                        .show_menu_on_left_click(false)
                        .on_menu_event(|app, event| match event.id().as_ref() {
                            "open" => {
                                reveal_main_window(app);
                            }
                            "quick_note" => {
                                if let Some(quick_win) = app.get_webview_window("quick-composer") {
                                    let _ = quick_win.show();
                                    let _ = quick_win.unminimize();
                                    let _ = quick_win.set_focus();
                                    #[cfg(target_os = "windows")]
                                    set_webview_memory_level(&quick_win, false);
                                    let _ = quick_win.emit("slag://focus-composer", ());
                                } else {
                                    reveal_main_window(app);
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.emit("slag://open-composer", ());
                                    }
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } = event
                            {
                                let app = tray.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                        #[cfg(target_os = "windows")]
                                        {
                                            set_webview_memory_level(&window, true);
                                            trim_working_set();
                                        }
                                    } else {
                                        reveal_main_window(app);
                                    }
                                }
                            }
                        })
                        .build(app)?;
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SLAG application");
}

#[cfg(all(test, desktop))]
mod open_target_tests {
    use super::resolve_open_target;
    use std::path::{Path, PathBuf};

    fn base() -> PathBuf {
        PathBuf::from("C:\\Users\\test\\AppData\\Roaming\\com.slag.notes")
    }

    #[test]
    fn accepts_vault_relative_targets() {
        let (path, is_file) = resolve_open_target(&base(), "vaults/main/notes/a.md").unwrap();
        assert_eq!(path, base().join("vaults").join("main").join("notes").join("a.md"));
        assert!(is_file);
    }

    #[test]
    fn accepts_logs_and_notes_aliases() {
        // The aliases are resolved before this helper; it only has to accept their shapes.
        assert!(resolve_open_target(&base(), "logs").is_ok());
        assert!(resolve_open_target(&base(), "vaults/main/notes").is_ok());
    }

    #[test]
    fn rejects_traversal_and_absolute_targets() {
        for target in [
            "..",
            "../Windows",
            "../../Windows/System32",
            "vaults/../../Windows",
            "a/./b",
            "a//b",
            "/etc/passwd",
            "C:\\Windows",
            "C:/Windows",
            "~/.ssh",
            "a\\..\\b",
        ] {
            assert!(resolve_open_target(&base(), target).is_err(), "accepted {target}");
        }
    }

    #[test]
    fn rejects_nul_and_control_characters() {
        assert!(resolve_open_target(&base(), "logs\0evil").is_err());
        assert!(resolve_open_target(&base(), "logs\n/evil").is_err());
        assert!(resolve_open_target(&base(), "").is_err());
    }

    #[test]
    fn keeps_normal_directories_relative() {
        let (path, is_file) = resolve_open_target(Path::new("base"), "backups/main").unwrap();
        assert_eq!(path, PathBuf::from("base").join("backups").join("main"));
        assert!(!is_file);
    }
}
