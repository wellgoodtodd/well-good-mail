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
