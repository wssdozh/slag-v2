use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                if let Some(main_window) = app.get_webview_window("main") {
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
