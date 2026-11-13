//! Opening attachments straight away, and saving them to a chosen folder without asking each time.
//! Opening keeps a copy in a private Previews folder inside the app's cache (never anywhere else), then hands it to
//! the program Windows uses for that kind of file. Changes made there aren't saved back to the email.

use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Kinds of file that run as programs. Opening one of these straight from an email is how most attacks start, so
/// they are never opened from here: they can still be saved and looked at on purpose.
const NEVER_OPEN: &[&str] = &[
    "exe", "com", "bat", "cmd", "scr", "pif", "msi", "msix", "msixbundle", "appx", "appxbundle", "msp", "cpl", "msc", "jar",
    "js", "jse", "vbs", "vbe", "wsf", "wsh", "ws", "hta", "ps1", "psm1", "psd1", "ps1xml", "lnk", "url", "reg", "inf", "scf",
    "application", "gadget", "dll", "sys", "iso", "img", "vhd", "vhdx", "xll", "library-ms", "settingcontent-ms", "chm", "diagcab",
    "appref-ms", "wsc", "sct", "vb", "vbscript", "rdp", "search-ms", "searchconnector-ms", "theme", "themepack", "deskthemepack",
    "py", "pyw", "pyz", "jnlp", "hlp", "msh", "msh1", "msh2", "mshxml", "ps2", "ps2xml", "psc1", "psc2", "cab", "mst", "pl", "xbap",
];

/// Marks a file as downloaded from the internet, as browsers do, so Windows SmartScreen and Office's Protected View
/// and macro blocking treat it with the same care. Best effort: a drive that can't hold the mark (FAT, some network
/// drives) simply goes without it.
pub fn mark_from_internet(path: &Path) {
    #[cfg(windows)]
    {
        let mut stream = path.as_os_str().to_owned();
        stream.push(":Zone.Identifier");
        let _ = fs::write(PathBuf::from(stream), "[ZoneTransfer]\r\nZoneId=3\r\n");
    }
    #[cfg(not(windows))]
    let _ = path;
}

/// The same mark, for files the app saved through the Save As box.
#[tauri::command]
pub fn mark_downloaded(path: String) {
    let p = PathBuf::from(&path);
    if p.is_file() {
        mark_from_internet(&p);
    }
}

/// Just a plain file name: no folders, no characters Windows forbids, never a reserved name.
fn clean_name(name: &str) -> String {
    let last = name.rsplit(|c: char| c == '/' || c == '\\').next().unwrap_or("");
    let mut n: String = last.chars().map(|c| if "<>:\"|?*".contains(c) || (c as u32) < 32 { '_' } else { c }).collect();
    n = n.trim().trim_end_matches(|c: char| c == '.' || c == ' ').to_string();
    if n.is_empty() || n.chars().all(|c| c == '.') {
        n = "attachment".into();
    }
    let stem = n.split('.').next().unwrap_or("").to_ascii_lowercase();
    if ["con", "prn", "aux", "nul"].contains(&stem.as_str()) || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4) {
        n = format!("_{}", n);
    }
    n.chars().take(180).collect()
}

fn extension(name: &str) -> String {
    Path::new(name).extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default()
}

fn previews_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("Previews");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn decode(data: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())
}

/// A free name in a folder: "report.pdf", then "report (2).pdf" and so on. Nothing is ever overwritten.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| name.to_string());
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let mut path = dir.join(name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{} ({}){}", stem, n, ext));
        n += 1;
    }
    path
}

/// Saves a copy in the Previews folder and opens it with its own program.
#[tauri::command]
pub fn open_attachment(app: AppHandle, name: String, data: String) -> Result<(), String> {
    let name = clean_name(&name);
    if NEVER_OPEN.contains(&extension(&name).as_str()) {
        return Err("For safety, programs and scripts aren't opened straight from an email. Save it first if you trust it.".into());
    }
    // Each opening gets its own folder, so two files with the same name never clash, and a file still open in
    // another program never blocks the next one.
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let dir = previews_dir(&app)?.join(stamp.to_string());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&name);
    fs::write(&path, decode(&data)?).map_err(|e| e.to_string())?;
    mark_from_internet(&path);
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

/// Opens a file the app saved, with its own program. Programs and scripts are never opened.
#[tauri::command]
pub fn open_saved(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("It has been moved or deleted.".into());
    }
    if NEVER_OPEN.contains(&extension(&path).as_str()) {
        return Err("For safety, programs and scripts aren't opened from here. Open it from its folder if you trust it.".into());
    }
    tauri_plugin_opener::open_path(&p, None::<&str>).map_err(|e| e.to_string())
}

/// Shows a saved file in File Explorer, selected.
#[tauri::command]
pub fn reveal_saved(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("It has been moved or deleted.".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| e.to_string())
}

/// Saves a file into a folder chosen in Settings, without asking. Returns where it went.
#[tauri::command]
pub fn save_to_folder(folder: String, name: String, data: String) -> Result<String, String> {
    let dir = PathBuf::from(&folder);
    if !dir.is_dir() {
        return Err(format!("The folder {} isn't there any more. Choose another in Settings, Search & Storage.", folder));
    }
    let path = free_path(&dir, &clean_name(&name));
    fs::write(&path, decode(&data)?).map_err(|e| e.to_string())?;
    mark_from_internet(&path);
    Ok(path.to_string_lossy().to_string())
}

/// Send To: saves a file into a place's folder, inside a year or month folder made as needed ("2026" or "2026/11 November").
/// The place's own folder has to be there already. Returns where it went.
#[tauri::command]
pub fn save_into_subfolder(folder: String, subfolder: String, name: String, data: String) -> Result<String, String> {
    let base = PathBuf::from(&folder);
    if !base.is_dir() {
        return Err(format!("The folder {} isn't there any more. Choose another for this place in Settings, Send To.", folder));
    }
    let mut dir = base;
    for part in subfolder.split(['/', '\\']).filter(|p| !p.is_empty() && *p != "." && *p != "..") {
        dir.push(clean_name(part));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &clean_name(&name));
    fs::write(&path, decode(&data)?).map_err(|e| e.to_string())?;
    mark_from_internet(&path);
    Ok(path.to_string_lossy().to_string())
}

fn walk(dir: &Path, f: &mut dyn FnMut(&Path, &fs::Metadata)) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if let Ok(m) = e.metadata() {
                if m.is_dir() {
                    walk(&p, f);
                } else {
                    f(&p, &m);
                }
            }
        }
    }
}

/// How much the Previews folder holds: bytes and number of files.
#[tauri::command]
pub fn previews_size(app: AppHandle) -> Result<(u64, u32), String> {
    let dir = previews_dir(&app)?;
    let (mut bytes, mut files) = (0u64, 0u32);
    walk(&dir, &mut |_: &Path, m: &fs::Metadata| {
        bytes += m.len();
        files += 1;
    });
    Ok((bytes, files))
}

/// Clears the Previews folder, or only what's older than some days. Files still open elsewhere are left for next time.
#[tauri::command]
pub fn clear_previews(app: AppHandle, older_than_days: Option<u64>) -> Result<u32, String> {
    let dir = previews_dir(&app)?;
    let cutoff = older_than_days.map(|d| SystemTime::now() - Duration::from_secs(d * 86400));
    let mut removed = 0u32;
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            let old = match (cutoff, e.metadata().and_then(|m| m.modified())) {
                (Some(c), Ok(t)) => t < c,
                (Some(_), Err(_)) => false,
                (None, _) => true,
            };
            if !old {
                continue;
            }
            let ok = if p.is_dir() { fs::remove_dir_all(&p).is_ok() } else { fs::remove_file(&p).is_ok() };
            if ok {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn open_previews_folder(app: AppHandle) -> Result<(), String> {
    let dir = previews_dir(&app)?;
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_are_plain() {
        assert_eq!(clean_name("..\\..\\evil.exe"), "evil.exe");
        assert_eq!(clean_name("a/b/report.pdf"), "report.pdf");
        assert_eq!(clean_name("CON.txt"), "_CON.txt");
        assert_eq!(clean_name("what?.pdf"), "what_.pdf");
        assert!(NEVER_OPEN.contains(&extension("Invoice.PDF.exe").as_str()));
    }
}
