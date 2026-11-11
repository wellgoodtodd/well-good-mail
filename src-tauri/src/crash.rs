//! Noticing that the app closed unexpectedly, so the next start can offer to send a problem report.
//!
//! While the app runs, a small marker file holds the time it was last seen alive (updated every 30 seconds). A tidy
//! quit deletes it. If it is still there at the next start, the app didn't close properly, unless the computer
//! itself restarted or shut down since (the marker is older than the time Windows started), which isn't a crash.
//! A Rust panic also leaves its message in a second file.

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

static DIR: OnceLock<PathBuf> = OnceLock::new();
static LAST: OnceLock<Option<LastRun>> = OnceLock::new();

#[derive(Serialize, Clone)]
pub struct LastRun {
    /// When it was last seen running, in milliseconds since 1970.
    seen: u64,
    /// The panic message, when the app itself failed.
    panic: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// When Windows last started, in milliseconds since 1970.
#[cfg(windows)]
fn boot_ms() -> u64 {
    let up = unsafe { windows::Win32::System::SystemInformation::GetTickCount64() };
    now_ms().saturating_sub(up)
}
#[cfg(not(windows))]
fn boot_ms() -> u64 {
    0
}

fn marker() -> Option<PathBuf> {
    DIR.get().map(|d| d.join("running.txt"))
}
fn panic_file() -> Option<PathBuf> {
    DIR.get().map(|d| d.join("crash.txt"))
}

/// At start: looks at how the last run ended, then marks this one as running.
pub fn start(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = fs::create_dir_all(&dir);
    let _ = DIR.set(dir);
    let seen = marker().and_then(|p| fs::read_to_string(p).ok()).and_then(|t| t.trim().parse::<u64>().ok());
    let panic = panic_file().and_then(|p| fs::read_to_string(&p).ok().map(|t| { let _ = fs::remove_file(&p); t }));
    let crashed = match (seen, &panic) {
        (_, Some(_)) => true,
        // Still marked as running, and seen after Windows last started: it stopped without quitting.
        (Some(s), None) => s > boot_ms(),
        _ => false,
    };
    let _ = LAST.set(if crashed { Some(LastRun { seen: seen.unwrap_or(0), panic }) } else { None });
    beat();
    std::thread::spawn(|| loop {
        std::thread::sleep(Duration::from_secs(30));
        beat();
    });
    // A panic leaves its message for next time. Release builds abort straight after this.
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(p) = panic_file() {
            let _ = fs::write(p, format!("{}", info).chars().take(2000).collect::<String>());
        }
        previous(info);
    }));
}

fn beat() {
    if let Some(p) = marker() {
        let _ = fs::write(p, now_ms().to_string());
    }
}

/// A tidy quit (or a restart to update): not a crash.
#[tauri::command]
pub fn clean_exit() {
    if let Some(p) = marker() {
        let _ = fs::remove_file(p);
    }
}

/// How the last run ended: nothing when it quit properly, otherwise when it was last seen and any panic message.
#[tauri::command]
pub fn last_run_crashed() -> Option<LastRun> {
    LAST.get().cloned().flatten()
}
