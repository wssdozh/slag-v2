use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
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

#[cfg(desktop)]
#[tauri::command]
fn open_in_folder(app: tauri::AppHandle, target: String) -> Result<String, String> {
    let base_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (target_path, is_file) = match target.as_str() {
        "logs" => (base_dir.join("logs"), false),
        "notes" => (base_dir.join("vaults").join("main").join("notes"), false),
        other => {
            let normalized = other.replace('\\', "/");
            let clean = normalized.trim_start_matches('/');
            let is_file = clean.ends_with(".md");
            if clean.is_empty() {
                (base_dir, false)
            } else {
                let mut path = base_dir;
                for part in clean.split('/') {
                    if !part.is_empty() {
                        path.push(part);
                    }
                }
                (path, is_file)
            }
        }
    };

    if is_file {
        if let Some(parent) = target_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    } else {
        let _ = std::fs::create_dir_all(&target_path);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![open_in_folder]);
    }

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    #[cfg(target_os = "windows")]
                    set_webview_memory_level(&window, false);
                }
            }))
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_denylist(&["quick-composer"])
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
                            } else if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                #[cfg(target_os = "windows")]
                                set_webview_memory_level(&window, false);
                                let _ = window.emit("slag://open-composer", ());
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ));

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

                if let Some(icon) = app.default_window_icon() {
                    let _tray = TrayIconBuilder::new()
                        .icon(icon.clone())
                        .tooltip("SLAG v2")
                        .menu(&menu)
                        .show_menu_on_left_click(false)
                        .on_menu_event(|app, event| match event.id().as_ref() {
                            "open" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                    #[cfg(target_os = "windows")]
                                    set_webview_memory_level(&window, false);
                                }
                            }
                            "quick_note" => {
                                if let Some(quick_win) = app.get_webview_window("quick-composer") {
                                    let _ = quick_win.show();
                                    let _ = quick_win.unminimize();
                                    let _ = quick_win.set_focus();
                                    #[cfg(target_os = "windows")]
                                    set_webview_memory_level(&quick_win, false);
                                    let _ = quick_win.emit("slag://focus-composer", ());
                                } else if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                    #[cfg(target_os = "windows")]
                                    set_webview_memory_level(&window, false);
                                    let _ = window.emit("slag://open-composer", ());
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
                                        let _ = window.show();
                                        let _ = window.unminimize();
                                        let _ = window.set_focus();
                                        #[cfg(target_os = "windows")]
                                        set_webview_memory_level(&window, false);
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
