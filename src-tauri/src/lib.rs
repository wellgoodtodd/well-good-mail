//! Well Good Mail: the Windows shell around the web interface.
//!
//! The interface (React) does the mail work. This side handles the things a
//! web page can't: signing in through the system browser, keeping sign ins in
//! Windows Credential Manager, the tray icon, start with Windows and updates.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

const KEYRING_SERVICE: &str = "WellGoodMail";

/// Starts a one shot local web server for the OAuth redirect and returns its
/// port. When Google redirects back, the query string is sent to the
/// interface as an `oauth-callback` event.
#[tauri::command]
fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    std::thread::spawn(move || {
        // Accept a few connections in case the browser asks for a favicon first.
        for _ in 0..5 {
            let Ok((mut stream, _)) = listener.accept() else { continue };
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]).to_string();
            let first_line = request.lines().next().unwrap_or("");
            let path = first_line.split_whitespace().nth(1).unwrap_or("/");

            if !path.contains("code=") && !path.contains("error=") {
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                continue;
            }

            let query = path.split_once('?').map(|(_, q)| q).unwrap_or("").to_string();
            let body = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Well Good Mail</title></head>\
                <body style=\"font-family:Segoe UI,sans-serif;background:#1c1c1e;color:#f2f2f2;display:flex;\
                align-items:center;justify-content:center;height:100vh;margin:0\">\
                <div style=\"text-align:center\"><h1 style=\"font-weight:600\">You're signed in</h1>\
                <p>You can close this tab and go back to Well Good Mail.</p></div></body></html>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            let _ = app.emit("oauth-callback", query);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            break;
        }
    });

    Ok(port)
}

/// Stores a secret (a refresh token) in Windows Credential Manager.
#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Reads a secret back. Returns `None` when nothing is stored.
#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Updates the tray tooltip with the unread count.
#[tauri::command]
fn set_unread_count(app: AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id("main") {
        let tip = if count == 0 {
            "Well Good Mail".to_string()
        } else {
            format!("Well Good Mail: {} unread", count)
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

/// When on, the window's close button quits the app instead of hiding it to the tray.
static CLOSE_QUITS: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_close_quits(on: bool) {
    CLOSE_QUITS.store(on, Ordering::Relaxed);
}

/// Sends a form POST to Microsoft's token address from the Rust side. The web view's own fetch adds an Origin header,
/// which makes Microsoft treat the call as coming from a web page and refuse it for a desktop app.
#[tauri::command]
async fn token_post(url: String, body: String) -> Result<(u16, String), String> {
    if !url.starts_with("https://login.microsoftonline.com/") {
        return Err("Only Microsoft's sign in address is allowed".into());
    }
    let client = tauri_plugin_http::reqwest::Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok((status, text))
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            start_oauth_listener,
            set_close_quits,
            token_post,
            secret_set,
            secret_get,
            secret_delete,
            set_unread_count
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Well Good Mail", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Check for new mail", true, None::<&str>)?;
            let compose = MenuItem::with_id(app, "compose", "New email", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &compose, &refresh, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Well Good Mail")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "refresh" => {
                        let _ = app.emit("tray-refresh", ());
                    }
                    "compose" => {
                        show_main(app);
                        let _ = app.emit("tray-compose", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Started by Windows at sign in: stay in the tray until opened.
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window keeps the app running in the tray so
            // mail and reminders keep arriving. Quit from the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    if CLOSE_QUITS.load(Ordering::Relaxed) {
                        window.app_handle().exit(0);
                    } else {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Well Good Mail");
}
