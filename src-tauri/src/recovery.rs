// Helping after the app's own data was deleted (an uninstall with "Delete the application data" ticked).
// Sign-ins live in Windows Credential Manager, outside those folders, so they can be found and the accounts added back.

/// The names of everything this app keeps in Credential Manager (the part before ".WellGoodMail"), such as
/// "google:someone@gmail.com". Only the names are read here, never the secrets themselves.
#[tauri::command]
pub fn secret_list() -> Vec<String> {
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::Security::Credentials::{CredEnumerateW, CredFree, CREDENTIALW};
        let mut out = Vec::new();
        let mut count = 0u32;
        let mut creds: *mut *mut CREDENTIALW = std::ptr::null_mut();
        unsafe {
            if CredEnumerateW(w!("*.WellGoodMail"), None, &mut count, &mut creds).is_err() || creds.is_null() {
                return out;
            }
            for i in 0..count as usize {
                let c = *creds.add(i);
                if c.is_null() {
                    continue;
                }
                if let Ok(name) = (*c).TargetName.to_string() {
                    if let Some(k) = name.strip_suffix(".WellGoodMail") {
                        out.push(k.to_string());
                    }
                }
            }
            CredFree(creds as *const core::ffi::c_void);
        }
        out
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Opens the Recycle Bin in File Explorer.
#[tauri::command]
pub fn open_recycle_bin() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("shell:RecycleBinFolder")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Only on Windows".into())
    }
}
