//! Email links (mailto:) opening a new email in Well Good Mail.
//!
//! Windows only lets you choose the default mail app yourself, in Settings. This registers Well Good Mail as able
//! to open email links (for this Windows user only, no admin needed), then the app opens the Default apps page
//! for you to confirm. When a link is clicked, Windows starts the app with the link; the running app is told
//! through the single-instance plugin and opens a new email.

use std::process::Command;
use std::sync::Mutex;

const PROG_ID: &str = "WellGoodMail.mailto";
const APP_NAME: &str = "Well Good Mail";

static START_LINK: Mutex<Option<String>> = Mutex::new(None);

/// The email link the app was started with, if any (asked once by the interface).
pub fn remember_start_link() {
    if let Some(link) = std::env::args().find(|a| a.to_ascii_lowercase().starts_with("mailto:")) {
        if let Ok(mut l) = START_LINK.lock() {
            *l = Some(link);
        }
    }
}

#[tauri::command]
pub fn take_start_mailto() -> Option<String> {
    START_LINK.lock().ok().and_then(|mut l| l.take())
}

#[cfg(windows)]
fn reg(args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    let out = Command::new("reg").args(args).creation_flags(0x0800_0000).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}
#[cfg(not(windows))]
fn reg(_args: &[&str]) -> Result<String, String> {
    Err("Only on Windows".into())
}

/// Registers the app as able to open email links, for this Windows user.
#[tauri::command]
pub fn register_mail_app() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().to_string();
    let cls = format!(r"HKCU\Software\Classes\{}", PROG_ID);
    let open = format!("\"{}\" \"%1\"", exe);
    let icon = format!("{},0", exe);
    reg(&["add", &cls, "/ve", "/d", "URL:MailTo Protocol", "/f"])?;
    reg(&["add", &cls, "/v", "URL Protocol", "/d", "", "/f"])?;
    reg(&["add", &format!(r"{}\DefaultIcon", cls), "/ve", "/d", &icon, "/f"])?;
    reg(&["add", &format!(r"{}\shell\open\command", cls), "/ve", "/d", &open, "/f"])?;
    let caps = r"HKCU\Software\WellGoodMail\Capabilities";
    reg(&["add", caps, "/v", "ApplicationName", "/d", APP_NAME, "/f"])?;
    reg(&["add", caps, "/v", "ApplicationDescription", "/d", "A calm mail app for Gmail, Outlook and iCloud.", "/f"])?;
    reg(&["add", &format!(r"{}\URLAssociations", caps), "/v", "mailto", "/d", PROG_ID, "/f"])?;
    reg(&["add", r"HKCU\Software\RegisteredApplications", "/v", APP_NAME, "/d", r"Software\WellGoodMail\Capabilities", "/f"])?;
    Ok(())
}

/// Whether Windows opens email links with Well Good Mail now.
#[tauri::command]
pub fn is_default_mail_app() -> bool {
    // Newer Windows 11 keeps the choice under UserChoiceLatest; older versions under UserChoice.
    ["UserChoiceLatest", "UserChoice"].iter().any(|key| {
        let path = format!(r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\{}", key);
        reg(&["query", &path, "/v", "ProgId"]).map(|out| out.contains(PROG_ID)).unwrap_or(false)
    })
}
