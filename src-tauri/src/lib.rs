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
}

#[cfg(target_os = "windows")]
fn configure_window_border(window: &tauri::Window) {
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
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
                    configure_window_border(&main_window.as_ref().window());
                    let win = main_window.clone();
                    main_window.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win.hide();
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
                    "Быстрая заметка (Ctrl+Shift+Space)",
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
                                }
                            }
                            "quick_note" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
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
                                    } else {
                                        let _ = window.show();
                                        let _ = window.unminimize();
                                        let _ = window.set_focus();
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
