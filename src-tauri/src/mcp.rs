//! The local connection for AI apps (MCP).
//!
//! When the person switches it on in Settings, the app listens on 127.0.0.1 only, on a random port, and writes the
//! port and a fresh secret token to `%APPDATA%\media.wellgood.mail\mcp.json`. An AI app such as Claude Desktop starts
//! `Well Good Mail.exe --mcp`, which reads that file, connects, sends the token, and then passes MCP messages (one
//! JSON message per line) both ways between the AI app and the running Well Good Mail.
//!
//! This side never decides anything. Every message goes to the interface, which checks the permissions, asks the
//! person when it should, and answers. Switching the connection off closes every open connection at once.

use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

struct Bridge {
    port: u16,
    stop: Arc<AtomicBool>,
    streams: Arc<Mutex<Vec<TcpStream>>>,
}

static BRIDGE: Mutex<Option<Bridge>> = Mutex::new(None);
static PENDING: OnceLock<Mutex<HashMap<u64, Sender<String>>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// How long one request may wait for an answer, including the person deciding on an Ask.
const ANSWER_WAIT: Duration = Duration::from_secs(180);

fn pending() -> &'static Mutex<HashMap<u64, Sender<String>>> {
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Where the port and token live while the connection is on.
fn info_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("media.wellgood.mail").join("mcp.json"))
}

/// A hard to guess token from the system's random hashing keys, the time and the process.
fn new_token() -> String {
    let mut out = String::new();
    for i in 0..4u64 {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u64(i);
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u32(std::process::id());
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

fn handle(app: AppHandle, stream: TcpStream, token: String) {
    let Ok(read_half) = stream.try_clone() else { return };
    let mut reader = BufReader::new(read_half);
    let mut writer = stream;
    let mut first = String::new();
    if reader.read_line(&mut first).is_err() || first.trim() != token {
        let _ = writer.shutdown(Shutdown::Both);
        return;
    }
    let _ = app.emit("mcp-connected", ());
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let parsed: Option<serde_json::Value> = serde_json::from_str(&line).ok();
        let original_id = parsed.as_ref().and_then(|v| v.get("id").cloned());
        let is_request = original_id.is_some() && parsed.as_ref().map(|v| v.get("method").is_some()).unwrap_or(false);
        if !is_request {
            // Notifications need no answer.
            let _ = app.emit("mcp-request", serde_json::json!({ "rid": 0, "body": line }));
            continue;
        }
        let rid = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel::<String>();
        pending().lock().unwrap().insert(rid, tx);
        let _ = app.emit("mcp-request", serde_json::json!({ "rid": rid, "body": line }));
        let answer = match rx.recv_timeout(ANSWER_WAIT) {
            Ok(a) => a,
            Err(_) => {
                pending().lock().unwrap().remove(&rid);
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": original_id,
                    "error": { "code": -32000, "message": "Well Good Mail did not answer in time." }
                })
                .to_string()
            }
        };
        if writer.write_all(answer.as_bytes()).is_err() || writer.write_all(b"\n").is_err() || writer.flush().is_err() {
            break;
        }
    }
    let _ = app.emit("mcp-disconnected", ());
}

/// Switches the connection on and returns the port. Calling it again while on does nothing new.
#[tauri::command]
pub fn mcp_start(app: AppHandle) -> Result<u16, String> {
    let mut slot = BRIDGE.lock().map_err(|e| e.to_string())?;
    if let Some(b) = slot.as_ref() {
        return Ok(b.port);
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = new_token();
    let path = info_path().ok_or("Could not find the app data folder")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::json!({ "port": port, "token": token }).to_string()).map_err(|e| e.to_string())?;

    let stop = Arc::new(AtomicBool::new(false));
    let streams: Arc<Mutex<Vec<TcpStream>>> = Arc::new(Mutex::new(Vec::new()));
    let (stop2, streams2) = (stop.clone(), streams.clone());
    std::thread::spawn(move || {
        while !stop2.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, addr)) => {
                    if !addr.ip().is_loopback() {
                        let _ = stream.shutdown(Shutdown::Both);
                        continue;
                    }
                    let _ = stream.set_nonblocking(false);
                    if let Ok(copy) = stream.try_clone() {
                        streams2.lock().unwrap().push(copy);
                    }
                    let (app, token) = (app.clone(), token.clone());
                    std::thread::spawn(move || handle(app, stream, token));
                }
                Err(_) => std::thread::sleep(Duration::from_millis(150)),
            }
        }
    });
    *slot = Some(Bridge { port, stop, streams });
    Ok(port)
}

/// Switches the connection off: no new connections, open ones closed, the token file removed.
#[tauri::command]
pub fn mcp_stop() -> Result<(), String> {
    let mut slot = BRIDGE.lock().map_err(|e| e.to_string())?;
    if let Some(b) = slot.take() {
        b.stop.store(true, Ordering::Relaxed);
        for s in b.streams.lock().unwrap().drain(..) {
            let _ = s.shutdown(Shutdown::Both);
        }
    }
    for (_, tx) in pending().lock().unwrap().drain() {
        drop(tx);
    }
    if let Some(path) = info_path() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// The interface's answer to one request.
#[tauri::command]
pub fn mcp_respond(rid: u64, body: String) -> Result<(), String> {
    if let Some(tx) = pending().lock().map_err(|e| e.to_string())?.remove(&rid) {
        let _ = tx.send(body);
    }
    Ok(())
}

/// The path of this program, for the setup line the AI app needs.
#[tauri::command]
pub fn mcp_exe_path() -> Result<String, String> {
    std::env::current_exe().map(|p| p.to_string_lossy().to_string()).map_err(|e| e.to_string())
}

fn refuse_first(message: &str) {
    // Answer the AI app's first request with a clear reason, so it can tell the person what to do.
    let mut first = String::new();
    if std::io::stdin().read_line(&mut first).is_ok() {
        let id = serde_json::from_str::<serde_json::Value>(first.trim()).ok().and_then(|v| v.get("id").cloned());
        if id.is_some() {
            let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message } });
            let mut out = std::io::stdout();
            let _ = writeln!(out, "{}", reply);
            let _ = out.flush();
        }
    }
    eprintln!("{}", message);
}

/// `Well Good Mail.exe --mcp`: passes messages between the AI app (standard input and output) and the running app.
pub fn passthrough() {
    const OFF: &str = "Well Good Mail is not open, or its AI connection is switched off. Open Well Good Mail, then Settings, AI connection, and switch it on.";
    let info = info_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    let (Some(port), Some(token)) = (
        info.as_ref().and_then(|v| v.get("port")).and_then(|v| v.as_u64()),
        info.as_ref().and_then(|v| v.get("token")).and_then(|v| v.as_str()).map(|s| s.to_string()),
    ) else {
        refuse_first(OFF);
        return;
    };
    let Ok(mut socket) = TcpStream::connect(("127.0.0.1", port as u16)) else {
        refuse_first(OFF);
        return;
    };
    if writeln!(socket, "{}", token).is_err() {
        refuse_first(OFF);
        return;
    }
    let Ok(from_app) = socket.try_clone() else { return };
    // The app's answers go straight to the AI app.
    let reader = std::thread::spawn(move || {
        let mut out = std::io::stdout();
        for line in BufReader::new(from_app).lines() {
            let Ok(line) = line else { break };
            if writeln!(out, "{}", line).is_err() || out.flush().is_err() {
                break;
            }
        }
    });
    // The AI app's requests go to the app.
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if writeln!(socket, "{}", line).is_err() || socket.flush().is_err() {
            break;
        }
    }
    let _ = socket.shutdown(Shutdown::Both);
    let _ = reader.join();
}

/// Where each AI app keeps its list of tools, for this Windows user.
fn config_path(kind: &str) -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    match kind {
        "claude-desktop" => std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("Claude").join("claude_desktop_config.json")),
        "gemini" => home.map(|h| h.join(".gemini").join("settings.json")),
        // Claude Code keeps tools for every folder in .claude.json in the user folder.
        "claude-code" => home.map(|h| h.join(".claude.json")),
        "codex" => home.map(|h| h.join(".codex").join("config.toml")),
        _ => None,
    }
}

const ENTRY: &str = "well-good-mail";

/// Adds Well Good Mail to an AI app's settings, or takes it out again, leaving everything else in that file as it was.
/// A copy of the file as it was is kept beside it first (".wgm-backup"). A file that can't be read safely is left alone.
#[tauri::command]
pub fn mcp_install(kind: String, remove: bool) -> Result<String, String> {
    let path = config_path(&kind).ok_or("That AI app can't be set up automatically. Copy the setup instead.")?;
    let dir = path.parent().ok_or("Could not find the settings folder")?.to_path_buf();
    let app_name = match kind.as_str() {
        "claude-desktop" => "Claude Desktop",
        "gemini" => "Gemini CLI",
        "claude-code" => "Claude Code",
        _ => "ChatGPT desktop",
    };
    // Claude Code writes its settings file the first time it runs; without it, it is not set up yet.
    if kind == "claude-code" && !path.exists() {
        return Err("Claude Code doesn't seem to be set up for this Windows user, so nothing was changed. Run it once, then try again.".to_string());
    }
    if !dir.exists() {
        if kind == "codex" && !remove {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        } else {
            return Err(format!("{} doesn't seem to be installed for this Windows user, so nothing was changed.", app_name));
        }
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().to_string();
    let before = std::fs::read_to_string(&path).ok();
    if let Some(text) = &before {
        let mut backup = path.clone().into_os_string();
        backup.push(".wgm-backup");
        std::fs::write(PathBuf::from(backup), text).map_err(|e| e.to_string())?;
    }

    let after = if kind == "codex" {
        // A TOML file: take out any old Well Good Mail block, then add the new one at the end.
        let text = before.unwrap_or_default();
        let mut kept: Vec<&str> = Vec::new();
        let mut skipping = false;
        for line in text.lines() {
            let t = line.trim();
            if t.starts_with('[') {
                skipping = t == "[mcp_servers.well-good-mail]" || t.starts_with("[mcp_servers.well-good-mail.");
            }
            if !skipping {
                kept.push(line);
            }
        }
        let mut out = kept.join("\n").trim_end().to_string();
        if !remove {
            if !out.is_empty() {
                out.push_str("\n\n");
            }
            out.push_str(&format!("[mcp_servers.well-good-mail]\ncommand = '{}'\nargs = [\"--mcp\"]", exe));
        }
        out.push('\n');
        out
    } else {
        // A JSON file: add or remove one entry under "mcpServers" and keep every other setting.
        let text = before.unwrap_or_else(|| "{}".to_string());
        let mut root: serde_json::Value = if text.trim().is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(&text).map_err(|_| format!("{}'s settings file couldn't be read safely, so it was left alone. Copy the setup and add it by hand instead.", app_name))?
        };
        let obj = root.as_object_mut().ok_or(format!("{}'s settings file isn't in the expected shape, so it was left alone.", app_name))?;
        let servers = obj.entry("mcpServers").or_insert_with(|| serde_json::json!({}));
        let servers = servers.as_object_mut().ok_or(format!("{}'s list of tools isn't in the expected shape, so it was left alone.", app_name))?;
        if remove {
            servers.remove(ENTRY);
        } else {
            let entry = if kind == "claude-code" {
                serde_json::json!({ "type": "stdio", "command": exe, "args": ["--mcp"], "env": {} })
            } else {
                serde_json::json!({ "command": exe, "args": ["--mcp"] })
            };
            servers.insert(ENTRY.to_string(), entry);
        }
        serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?
    };
    std::fs::write(&path, after).map_err(|e| e.to_string())?;
    Ok(if remove {
        format!("Taken out of {}. Restart it to finish.", app_name)
    } else {
        format!("Added to {}. Quit it fully (from the tray too) and open it again.", app_name)
    })
}

/// Whether an AI app's settings already list Well Good Mail.
#[tauri::command]
pub fn mcp_installed(kind: String) -> bool {
    let Some(path) = config_path(&kind) else { return false };
    let Ok(text) = std::fs::read_to_string(path) else { return false };
    if kind == "codex" {
        text.lines().any(|l| l.trim() == "[mcp_servers.well-good-mail]")
    } else {
        serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v.get("mcpServers").and_then(|s| s.get(ENTRY)).map(|_| true)).unwrap_or(false)
    }
}
