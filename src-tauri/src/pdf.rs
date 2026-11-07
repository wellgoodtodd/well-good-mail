//! Saving an email as a PDF with no print window, using the Windows web view's own PDF maker.
//!
//! The email's page is shown in a second web view, parked off screen, and written straight to the file the person
//! chose. Nothing here reads the file back or sends it anywhere.

use std::sync::atomic::{AtomicBool, Ordering};

/// True while the Windows print window is open, so closing it can't quit the app by accident.
pub static PRINTING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_printing(on: bool) {
    PRINTING.store(on, Ordering::Relaxed);
}

#[tauri::command]
pub async fn save_pdf(app: tauri::AppHandle, html: String, path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        windows_impl::save(app, html, path).await
    }
    #[cfg(not(windows))]
    {
        let _ = (app, html, path);
        Err("Saving a PDF this way is only available on Windows".into())
    }
}

#[cfg(windows)]
mod windows_impl {
    use std::sync::mpsc;
    use std::time::Duration;

    use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

    fn es<E: std::fmt::Debug>(e: E) -> String {
        format!("{:?}", e)
    }

    pub async fn save(app: AppHandle, html: String, path: String) -> Result<(), String> {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let tmp = std::env::temp_dir().join(format!("wgm-print-{}.html", stamp));
        std::fs::write(&tmp, html).map_err(es)?;
        let url = tauri::Url::from_file_path(&tmp).map_err(|_| "Couldn't prepare the page for the PDF".to_string())?;

        let label = "pdf-printer";
        if let Some(old) = app.get_webview_window(label) {
            let _ = old.close();
        }
        let (loaded_tx, loaded_rx) = mpsc::channel::<()>();
        let win = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
            .title("Preparing PDF")
            .decorations(false)
            .skip_taskbar(true)
            .focused(false)
            .position(-4000.0, -4000.0)
            .inner_size(900.0, 1200.0)
            .on_page_load(move |_w, p| {
                if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                    let _ = loaded_tx.send(());
                }
            })
            .build()
            .map_err(es)?;

        let loaded = tauri::async_runtime::spawn_blocking(move || {
            let ok = loaded_rx.recv_timeout(Duration::from_secs(30)).is_ok();
            // A moment for pictures to finish drawing.
            std::thread::sleep(Duration::from_millis(600));
            ok
        })
        .await
        .map_err(es)?;
        if !loaded {
            let _ = win.close();
            let _ = std::fs::remove_file(&tmp);
            return Err("The page for the PDF did not finish loading".into());
        }

        let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
        let target = path.clone();
        win.with_webview(move |webview| {
            let result = unsafe { print_to_pdf(&webview, &target) };
            let _ = done_tx.send(result);
        })
        .map_err(es)?;

        let outcome = tauri::async_runtime::spawn_blocking(move || done_rx.recv_timeout(Duration::from_secs(90)))
            .await
            .map_err(es)?;
        let _ = win.close();
        let _ = std::fs::remove_file(&tmp);
        match outcome {
            Ok(r) => r,
            Err(_) => Err("Making the PDF took too long".into()),
        }
    }

    unsafe fn print_to_pdf(webview: &tauri::webview::PlatformWebview, path: &str) -> Result<(), String> {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
        use webview2_com::PrintToPdfCompletedHandler;
        use windows::core::{Interface, HSTRING};
        use windows::Win32::Foundation::E_FAIL;

        let core = webview.controller().CoreWebView2().map_err(es)?;
        let core7: ICoreWebView2_7 = core.cast().map_err(es)?;
        let target = HSTRING::from(path);
        PrintToPdfCompletedHandler::wait_for_async_operation(
            Box::new(move |handler| core7.PrintToPdf(&target, None, &handler).map_err(webview2_com::Error::WindowsError)),
            Box::new(|error_code, ok| {
                error_code?;
                if ok {
                    Ok(())
                } else {
                    Err(windows::core::Error::from(E_FAIL))
                }
            }),
        )
        .map_err(es)
    }
}
