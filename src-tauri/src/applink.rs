//! Links into Well Good Mail from other apps: wellgoodmail://thread/<account>/<thread id>, wellgoodmail://calendar/<day>
//! and wellgoodmail://calendar/event/<id>. The link type is registered for this Windows user at every start (no admin,
//! nothing to choose), so it keeps pointing at the app after updates. When a link is clicked, Windows starts the app
//! with it; the running app is told through the single-instance plugin, and the interface works out what to open.

use std::sync::Mutex;

const SCHEME: &str = "wellgoodmail";

static START_LINK: Mutex<Option<String>> = Mutex::new(None);

pub fn link_in(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| a.to_ascii_lowercase().starts_with("wellgoodmail:")).cloned()
}

/// The link the app was started with, if any (asked once by the interface).
pub fn remember_start_link() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(link) = link_in(&args) {
        if let Ok(mut l) = START_LINK.lock() {
            *l = Some(link);
        }
    }
}

#[tauri::command]
pub fn take_start_applink() -> Option<String> {
    START_LINK.lock().ok().and_then(|mut l| l.take())
}

/// Tells Windows that wellgoodmail: links open this app (for this user only). Runs in the background, hidden.
pub fn register() {
    std::thread::spawn(|| {
        let Ok(exe) = std::env::current_exe() else { return };
        let exe = exe.to_string_lossy().to_string();
        let cls = format!(r"HKCU\Software\Classes\{}", SCHEME);
        let open = format!("\"{}\" \"%1\"", exe);
        let icon = format!("{},0", exe);
        let _ = crate::mailto::reg(&["add", &cls, "/ve", "/d", "URL:Well Good Mail link", "/f"]);
        let _ = crate::mailto::reg(&["add", &cls, "/v", "URL Protocol", "/d", "", "/f"]);
        let _ = crate::mailto::reg(&["add", &format!(r"{}\DefaultIcon", cls), "/ve", "/d", &icon, "/f"]);
        let _ = crate::mailto::reg(&["add", &format!(r"{}\shell\open\command", cls), "/ve", "/d", &open, "/f"]);
    });
}
