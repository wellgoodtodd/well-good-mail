//! Calendar files (.ics) opened from Windows: Open with › Well Good Mail, or a double-click once it is the default.
//!
//! The installer tells Windows the app can open .ics files. Windows starts the app with the file's path; the
//! running app is told through the single-instance plugin. Either way the interface asks for the file's text and
//! shows the event in the New event form, with a calendar to choose.

use std::sync::Mutex;

static START_FILE: Mutex<Option<String>> = Mutex::new(None);

/// The .ics file among some start-up arguments, if there is one.
pub fn ics_in(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| a.to_ascii_lowercase().ends_with(".ics")).cloned()
}

/// The calendar file the app was started with, if any (asked once by the interface).
pub fn remember_start_file() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(path) = ics_in(&args) {
        if let Ok(mut f) = START_FILE.lock() {
            *f = Some(path);
        }
    }
}

#[tauri::command]
pub fn take_start_ics() -> Option<String> {
    START_FILE.lock().ok().and_then(|mut f| f.take())
}

/// The text of a calendar file. Only .ics files, and only small ones: an event is a few kilobytes.
#[tauri::command]
pub fn read_ics(path: String) -> Result<String, String> {
    if !path.to_ascii_lowercase().ends_with(".ics") {
        return Err("That isn't a calendar file".into());
    }
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 2_000_000 {
        return Err("That calendar file is too big to open".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
