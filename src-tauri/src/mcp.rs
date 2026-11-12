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
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
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
/// Each connection gets a number, so the app knows which AI app sent what.
static NEXT_CONN: AtomicU64 = AtomicU64::new(1);

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

/// The longest line read before the token is checked, and the longest message after. Anything longer closes the
/// connection, so nothing on this computer can fill the memory by sending endless text.
const TOKEN_LINE_MAX: u64 = 256;
const MESSAGE_MAX: u64 = 8 * 1024 * 1024;
/// Connections open at once. AI apps open one or two; more than this is something misbehaving.
const MAX_CONNECTIONS: usize = 16;
static LIVE: AtomicUsize = AtomicUsize::new(0);

/// Counts a connection while it's open.
struct Live;
impl Live {
    fn take() -> Option<Live> {
        if LIVE.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
            LIVE.fetch_sub(1, Ordering::SeqCst);
            return None;
        }
        Some(Live)
    }
}
impl Drop for Live {
    fn drop(&mut self) {
        LIVE.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Reads one line, but no more than max bytes. A line that doesn't end within that is an error.
fn read_capped(reader: &mut BufReader<TcpStream>, max: u64, out: &mut String) -> std::io::Result<usize> {
    let n = reader.by_ref().take(max).read_line(out)?;
    if n as u64 >= max && !out.ends_with('\n') {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "line too long"));
    }
    Ok(n)
}

fn handle(app: AppHandle, stream: TcpStream, token: String, conn: u64) {
    let Some(_live) = Live::take() else {
        let _ = stream.shutdown(Shutdown::Both);
        return;
    };
    let Ok(read_half) = stream.try_clone() else { return };
    let mut reader = BufReader::new(read_half);
    let mut writer = stream;
    let mut first = String::new();
    if read_capped(&mut reader, TOKEN_LINE_MAX, &mut first).is_err() || first.trim() != token {
        let _ = writer.shutdown(Shutdown::Both);
        return;
    }
    let _ = app.emit("mcp-connected", serde_json::json!({ "conn": conn }));
    loop {
        let mut line = String::new();
        match read_capped(&mut reader, MESSAGE_MAX, &mut line) {
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
            let _ = app.emit("mcp-request", serde_json::json!({ "rid": 0, "conn": conn, "body": line }));
            continue;
        }
        let rid = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel::<String>();
        pending().lock().unwrap().insert(rid, tx);
        let _ = app.emit("mcp-request", serde_json::json!({ "rid": rid, "conn": conn, "body": line }));
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
    let _ = app.emit("mcp-disconnected", serde_json::json!({ "conn": conn }));
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
                    let conn = NEXT_CONN.fetch_add(1, Ordering::Relaxed);
                    std::thread::spawn(move || handle(app, stream, token, conn));
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
    helper_exe().map(|p| p.to_string_lossy().to_string())
}

/// The program AI apps start. It is a copy of Well Good Mail kept in the app's data folder, so installing an update
/// (which has to close every running copy in the install folder) leaves the AI app's connection alone; the copy then
/// reconnects by itself. The copy is refreshed when the version changes, but only when nothing is using it.
fn helper_exe() -> Result<PathBuf, String> {
    let src = std::env::current_exe().map_err(|e| e.to_string())?;
    let Some(dir) = std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("media.wellgood.mail").join("mcp")) else { return Ok(src) };
    let dest = dir.join("well-good-mail-mcp.exe");
    let stamp = dir.join("version.txt");
    let version = env!("CARGO_PKG_VERSION");
    if dest.exists() && std::fs::read_to_string(&stamp).ok().as_deref() == Some(version) {
        return Ok(dest);
    }
    if std::fs::create_dir_all(&dir).is_ok() {
        let tmp = dir.join("well-good-mail-mcp.new");
        if std::fs::copy(&src, &tmp).is_ok() {
            // Fails while an AI app is using the old copy. That is fine: the old copy still works, and this runs again next time.
            if std::fs::rename(&tmp, &dest).is_ok() {
                let _ = std::fs::write(&stamp, version);
            } else {
                let _ = std::fs::remove_file(&tmp);
            }
        }
    }
    Ok(if dest.exists() { dest } else { src })
}

const OFF_MESSAGE: &str = "Well Good Mail is not open, or its AI connection is switched off. Open Well Good Mail, then Settings, AI connection, and switch it on. Then ask again.";

/// The port and token of the running app, if its connection is on.
fn read_info() -> Option<(u16, String)> {
    let info = info_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())?;
    let port = info.get("port")?.as_u64()? as u16;
    let token = info.get("token")?.as_str()?.to_string();
    Some((port, token))
}

type Shared<T> = Arc<Mutex<T>>;

/// Connects to the running app and starts passing its answers to the AI app. False when the app is closed or off.
fn connect(out: &Shared<std::io::Stdout>, sock: &Shared<Option<TcpStream>>) -> bool {
    let mut guard = sock.lock().unwrap();
    if guard.is_some() {
        return true;
    }
    let Some((port, token)) = read_info() else { return false };
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else { return false };
    if writeln!(stream, "{}", token).is_err() || stream.flush().is_err() {
        return false;
    }
    let Ok(from_app) = stream.try_clone() else { return false };
    *guard = Some(stream);
    let (out2, sock2) = (out.clone(), sock.clone());
    std::thread::spawn(move || {
        for line in BufReader::new(from_app).lines() {
            let Ok(line) = line else { break };
            let mut o = out2.lock().unwrap();
            if writeln!(o, "{}", line).is_err() || o.flush().is_err() {
                break;
            }
        }
        // The app closed or switched the connection off. The next request tries again.
        *sock2.lock().unwrap() = None;
    });
    true
}

fn send(sock: &Shared<Option<TcpStream>>, line: &str) -> bool {
    let mut guard = sock.lock().unwrap();
    let Some(s) = guard.as_mut() else { return false };
    if writeln!(s, "{}", line).is_ok() && s.flush().is_ok() {
        return true;
    }
    *guard = None;
    false
}

/// `Well Good Mail.exe --mcp`: passes messages between the AI app (standard input and output) and the running app.
/// If Well Good Mail is closed or its connection is off, each request gets a clear answer saying so, and the next
/// request tries again. So opening the app, or switching the connection back on, works without restarting the AI app.
pub fn passthrough() {
    let out: Shared<std::io::Stdout> = Arc::new(Mutex::new(std::io::stdout()));
    let sock: Shared<Option<TcpStream>> = Arc::new(Mutex::new(None));
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let mut sent = connect(&out, &sock) && send(&sock, &line);
        if !sent {
            // One fresh try, in case the app was restarted or switched off and on.
            sent = connect(&out, &sock) && send(&sock, &line);
        }
        if !sent {
            let id = serde_json::from_str::<serde_json::Value>(&line).ok().and_then(|v| v.get("id").cloned());
            if let Some(id) = id {
                let reply = serde_json::json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": OFF_MESSAGE } });
                let mut o = out.lock().unwrap();
                let _ = writeln!(o, "{}", reply);
                let _ = o.flush();
            }
        }
    }
    let last = sock.lock().unwrap().take();
    if let Some(s) = last {
        let _ = s.shutdown(Shutdown::Both);
    }
}

/// Starts this program the same way an AI app does, asks it to say hello and list its tools, and reports back.
/// Proves the whole path works before you open Claude.
#[tauri::command]
pub async fn mcp_self_test() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use std::process::{Command, Stdio};
        let exe = helper_exe()?;
        let mut child = Command::new(exe)
            .arg("--mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Couldn't start the connection: {}", e))?;
        let mut stdin = child.stdin.take().ok_or("No input")?;
        let stdout = child.stdout.take().ok_or("No output")?;
        let (tx, rx) = channel::<String>();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        let hello = serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "well-good-mail-self-test", "version": "1" } } });
        let list = serde_json::json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        let result = (|| -> Result<String, String> {
            writeln!(stdin, "{}", hello).map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
            let first = rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "No answer from Well Good Mail.".to_string())?;
            let v: serde_json::Value = serde_json::from_str(&first).map_err(|_| "An answer came back, but not one Claude would understand.".to_string())?;
            if let Some(err) = v.get("error") {
                return Err(err.get("message").and_then(|m| m.as_str()).unwrap_or("The connection said no.").to_string());
            }
            writeln!(stdin, "{}", list).map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
            let second = rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "Said hello, but did not list its tools.".to_string())?;
            let v: serde_json::Value = serde_json::from_str(&second).map_err(|_| "The tool list could not be read.".to_string())?;
            let n = v.get("result").and_then(|r| r.get("tools")).and_then(|t| t.as_array()).map(|a| a.len()).unwrap_or(0);
            Ok(format!("Working. Claude will see {} {}.", n, if n == 1 { "tool" } else { "tools" }))
        })();
        drop(stdin);
        let _ = child.kill();
        let _ = child.wait();
        result
    })
    .await
    .map_err(|e| e.to_string())?
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
    let exe = helper_exe()?.to_string_lossy().to_string();
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
