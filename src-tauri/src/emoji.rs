//! The Emoji button: opens Windows' own emoji panel, as if Win + . were pressed. The interface puts the cursor in the
//! message first, so the emoji lands there.

#[cfg(windows)]
#[tauri::command]
pub fn open_emoji_panel() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_LWIN, VK_OEM_PERIOD,
    };
    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) }, time: 0, dwExtraInfo: 0 },
        },
    };
    let inputs = [key(VK_LWIN, false), key(VK_OEM_PERIOD, false), key(VK_OEM_PERIOD, true), key(VK_LWIN, true)];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err("Windows didn't take the key press".into());
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn open_emoji_panel() -> Result<(), String> {
    Err("Only on Windows".into())
}
