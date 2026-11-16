//! Files sent from Windows: right-click › Send to › Well Good Mail.
//!
//! The installer puts a Well Good Mail shortcut in the Send to folder that starts the app with `--attach` and the
//! chosen files after it. A running app is told through the single-instance plugin. Either way the interface asks
//! for the files and opens a new email with them attached.

use base64::Engine;
use std::sync::Mutex;

static START_FILES: Mutex<Option<Vec<String>>> = Mutex::new(None);

/// Biggest file that can go on an email (Gmail and Outlook stop at about 25 MB for the whole email).
const MOST: u64 = 25 * 1024 * 1024;

/// The files after `--attach` among some start-up arguments, if it is there.
pub fn files_in(args: &[String]) -> Option<Vec<String>> {
    let at = args.iter().position(|a| a == "--attach")?;
    let files: Vec<String> = args[at + 1..].iter().filter(|a| !a.starts_with("--")).cloned().collect();
    if files.is_empty() { None } else { Some(files) }
}

/// The files the app was started with, if any (asked once by the interface).
pub fn remember_start_files() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(files) = files_in(&args) {
        if let Ok(mut f) = START_FILES.lock() {
            *f = Some(files);
        }
    }
}

#[tauri::command]
pub fn take_start_files() -> Option<Vec<String>> {
    START_FILES.lock().ok().and_then(|mut f| f.take())
}

#[derive(serde::Serialize)]
pub struct SentFile {
    name: String,
    size: u64,
    #[serde(rename = "dataB64")]
    data_b64: String,
}

/// One file sent from Windows, ready to attach. Folders and files over 25 MB are refused.
#[tauri::command]
pub fn read_sent_file(path: String) -> Result<SentFile, String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    if meta.is_dir() {
        return Err(format!("{name} is a folder"));
    }
    if meta.len() > MOST {
        return Err(format!("{name} is over 25 MB"));
    }
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    Ok(SentFile { name, size: meta.len(), data_b64: base64::engine::general_purpose::STANDARD.encode(bytes) })
}
