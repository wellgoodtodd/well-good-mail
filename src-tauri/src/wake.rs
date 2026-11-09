//! Scheduled email when Well Good Mail is closed: a Windows scheduled task starts it (in the tray) at the send time,
//! waking the PC from sleep if it has to. Gmail has no scheduled send that other apps can use, so the app itself
//! has to be running to send. If it is already running, the second start only tells it to send what's due.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;

/// Only letters, numbers and dashes in task names.
fn task_name(id: &str) -> String {
    let clean: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(60).collect();
    format!("Well Good Mail - send {}", clean)
}

fn powershell(script: &str) -> Result<(), String> {
    // Windows' own PowerShell by its full path, so a file called powershell.exe somewhere else can never stand in for it.
    let system = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let mut cmd = Command::new(format!("{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", system));
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // no console window
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().chars().take(300).collect())
    }
}

/// PowerShell single-quoted text.
fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Starts Well Good Mail at `at` (local time, like "2026-11-10T00:05:00"), waking the PC if needed.
#[tauri::command]
pub fn schedule_wake(id: String, at: String) -> Result<(), String> {
    if !at.chars().all(|c| c.is_ascii_digit() || c == '-' || c == ':' || c == 'T') {
        return Err("Bad time".into());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let script = format!(
        "$a = New-ScheduledTaskAction -Execute {exe} -Argument '--hidden --send-due'; \
         $t = New-ScheduledTaskTrigger -Once -At ([datetime]{at}); \
         $s = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; \
         Register-ScheduledTask -TaskName {name} -Action $a -Trigger $t -Settings $s -Force | Out-Null",
        exe = quote(&exe.to_string_lossy()),
        at = quote(&at),
        name = quote(&task_name(&id)),
    );
    powershell(&script)
}

/// Removes the wake-up for a scheduled email that was sent or cancelled. Fine if there wasn't one.
#[tauri::command]
pub fn cancel_wake(id: String) -> Result<(), String> {
    let script = format!(
        "Unregister-ScheduledTask -TaskName {name} -Confirm:$false -ErrorAction SilentlyContinue",
        name = quote(&task_name(&id)),
    );
    powershell(&script)
}
