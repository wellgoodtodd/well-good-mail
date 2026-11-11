//! IMAP and SMTP for accounts that are not Gmail or Microsoft (iCloud, Yahoo, Fastmail and others).
//!
//! A web page can't open a raw mail connection, so this side does it. It stays deliberately plain: each command does
//! one job and returns raw data. The interface (src/lib/providers/imap.ts) does the thinking: which folders to read,
//! how to build threads, how to read the email itself.
//!
//! Connections are kept open and reused, like Apple Mail does: at most a few per account, checked before reuse when
//! they have been quiet. Signing in for every job made iCloud refuse sign ins for a while (it read the burst as an
//! attack), which looked like a wrong password. A separate watcher sits on the Inbox (IDLE) and tells the interface
//! the moment something arrives.
//!
//! Connections are always TLS from the first byte (port 993 for IMAP). Sending uses SMTP over TLS (port 465)
//! or STARTTLS (port 587).

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use imap::extensions::idle::WaitOutcome;
use imap::types::{Fetch, Flag, NameAttribute};
use native_tls::{TlsConnector, TlsStream};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

type Sess = imap::Session<TlsStream<TcpStream>>;

/// How many bytes of each email are read for the list: the headers and the start of the body, enough for a preview.
const PREVIEW_BYTES: u32 = 6000;
/// How many emails are asked for in one request.
const CHUNK: usize = 100;

#[derive(Deserialize, Clone)]
pub struct Conn {
    host: String,
    port: u16,
    user: String,
    pass: String,
}

fn es<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Runs blocking mail work off the interface's thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(es)?
}

/// Connects and signs in. A refused password comes back starting with "AUTH:" so the interface can ask again.
fn open(c: &Conn) -> Result<Sess, String> {
    let tls = TlsConnector::builder().build().map_err(es)?;
    let client = imap::connect((c.host.as_str(), c.port), c.host.as_str(), &tls)
        .map_err(|e| format!("Couldn't connect to {}: {}", c.host, e))?;
    client.login(&c.user, &c.pass).map_err(|e| format!("AUTH: {}", e.0))
}

// ---------- kept connections ----------

/// Most connections open at once for one account. iCloud allows more, but a few is plenty and stays polite.
const MAX_PER_ACCOUNT: usize = 3;
/// A kept connection quiet for longer than this gets a NOOP before reuse, in case the server closed it.
const CHECK_AFTER: Duration = Duration::from_secs(4 * 60);

#[derive(Default)]
struct Slot {
    idle: Vec<(Sess, Instant)>,
    out: usize,
}

struct Pool {
    slots: Mutex<HashMap<String, Slot>>,
    freed: Condvar,
}

fn pool() -> &'static Pool {
    static P: OnceLock<Pool> = OnceLock::new();
    P.get_or_init(|| Pool { slots: Mutex::new(HashMap::new()), freed: Condvar::new() })
}

/// One pool per account and password: a new password starts afresh. The password itself is never kept as text here.
fn key(c: &Conn) -> String {
    let mut h = DefaultHasher::new();
    c.pass.hash(&mut h);
    format!("{}:{}:{}:{:x}", c.host, c.port, c.user, h.finish())
}

/// Hands a connection back (or just the place, when it is gone) and wakes anyone waiting for one.
fn release(k: &str, s: Option<Sess>) {
    let p = pool();
    let mut extra: Option<Sess> = None;
    if let Ok(mut slots) = p.slots.lock() {
        let slot = slots.entry(k.to_string()).or_default();
        slot.out = slot.out.saturating_sub(1);
        if let Some(s) = s {
            if slot.idle.len() < MAX_PER_ACCOUNT {
                slot.idle.push((s, Instant::now()));
            } else {
                extra = Some(s);
            }
        }
    }
    p.freed.notify_one();
    if let Some(mut s) = extra {
        let _ = s.logout();
    }
}

/// A connection for this account: a kept one when there is one, otherwise a new one. The bool says it was kept.
fn take(c: &Conn) -> Result<(Sess, bool), String> {
    let k = key(c);
    let p = pool();
    let found = {
        let mut slots = p.slots.lock().map_err(|_| "Mail connections are busy. Try again.".to_string())?;
        loop {
            let slot = slots.entry(k.clone()).or_default();
            if let Some(item) = slot.idle.pop() {
                slot.out += 1;
                break Some(item);
            }
            if slot.out < MAX_PER_ACCOUNT {
                slot.out += 1;
                break None;
            }
            let (g, t) = p.freed.wait_timeout(slots, Duration::from_secs(60)).map_err(|_| "Mail connections are busy. Try again.".to_string())?;
            slots = g;
            if t.timed_out() {
                // Something is holding on for a long time; go ahead rather than wait for ever.
                slots.entry(k.clone()).or_default().out += 1;
                break None;
            }
        }
    };
    if let Some((mut s, at)) = found {
        if at.elapsed() < CHECK_AFTER || s.noop().is_ok() {
            return Ok((s, true));
        }
    }
    match open(c) {
        Ok(s) => Ok((s, false)),
        Err(e) => {
            release(&k, None);
            Err(e)
        }
    }
}

/// Runs one job on a kept connection. If a kept one fails (the server may have closed it without a word), the job
/// runs once more on a new connection. The connection goes back for the next job when it worked.
fn with_sess<T>(c: &Conn, mut job: impl FnMut(&mut Sess) -> Result<T, String>) -> Result<T, String> {
    let k = key(c);
    let (mut s, kept) = take(c)?;
    match job(&mut s) {
        Ok(v) => {
            release(&k, Some(s));
            Ok(v)
        }
        Err(e) if !kept => {
            release(&k, None);
            Err(e)
        }
        Err(_) => {
            drop(s);
            let mut fresh = match open(c) {
                Ok(f) => f,
                Err(e) => {
                    release(&k, None);
                    return Err(e);
                }
            };
            let r = job(&mut fresh);
            release(&k, if r.is_ok() { Some(fresh) } else { None });
            r
        }
    }
}

// ---------- watching the Inbox ----------

fn watchers() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static W: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    W.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Sleeps in short steps, so a stopped watcher ends soon.
fn nap(stop: &AtomicBool, total: Duration) {
    let step = Duration::from_secs(5);
    let mut slept = Duration::ZERO;
    while slept < total && !stop.load(Ordering::SeqCst) {
        std::thread::sleep(step);
        slept += step;
    }
}

/// Watches an account's Inbox on its own connection and sends "imap-changed" (with the account id) whenever the
/// server says something changed. Starting it again for the same account (a new password) replaces the old one.
#[tauri::command]
pub fn imap_watch(app: AppHandle, id: String, conn: Conn) {
    let stop = Arc::new(AtomicBool::new(false));
    if let Ok(mut w) = watchers().lock() {
        if let Some(old) = w.insert(id.clone(), stop.clone()) {
            old.store(true, Ordering::SeqCst);
        }
    }
    std::thread::spawn(move || {
        let mut backoff = Duration::from_secs(30);
        while !stop.load(Ordering::SeqCst) {
            match open(&conn) {
                Ok(mut s) => {
                    backoff = Duration::from_secs(30);
                    if s.select("INBOX").is_err() {
                        let _ = s.logout();
                        nap(&stop, Duration::from_secs(5 * 60));
                        continue;
                    }
                    while !stop.load(Ordering::SeqCst) {
                        // Ten minutes at a time: well inside the half hour servers allow, and a stopped watcher ends.
                        let outcome = match s.idle() {
                            Ok(h) => h.wait_with_timeout(Duration::from_secs(10 * 60)),
                            Err(e) => Err(e),
                        };
                        match outcome {
                            Ok(WaitOutcome::MailboxChanged) => {
                                let _ = app.emit("imap-changed", id.clone());
                            }
                            Ok(WaitOutcome::TimedOut) => {
                                if s.noop().is_err() {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    let _ = s.logout();
                }
                Err(e) => {
                    // A refused sign in waits a long time, so the watcher never adds to the sign ins a server counts.
                    let pause = if e.starts_with("AUTH:") { Duration::from_secs(20 * 60) } else { backoff };
                    nap(&stop, pause);
                    backoff = (backoff * 2).min(Duration::from_secs(15 * 60));
                }
            }
        }
    });
}

/// Stops watching an account's Inbox (it was removed).
#[tauri::command]
pub fn imap_unwatch(id: String) {
    if let Ok(mut w) = watchers().lock() {
        if let Some(old) = w.remove(&id) {
            old.store(true, Ordering::SeqCst);
        }
    }
}

fn uid_set(uids: &[u32]) -> String {
    uids.iter().map(|u| u.to_string()).collect::<Vec<_>>().join(",")
}

fn flag_name(f: &Flag) -> String {
    match f {
        Flag::Seen => "\\Seen".into(),
        Flag::Answered => "\\Answered".into(),
        Flag::Flagged => "\\Flagged".into(),
        Flag::Deleted => "\\Deleted".into(),
        Flag::Draft => "\\Draft".into(),
        Flag::Custom(c) => c.to_string(),
        _ => String::new(),
    }
}

fn flags_of(f: &Fetch) -> Vec<String> {
    f.flags().iter().map(flag_name).filter(|s| !s.is_empty()).collect()
}

fn quote(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

// ---------- folders ----------

#[derive(Serialize)]
pub struct FolderInfo {
    name: String,
    delimiter: Option<String>,
    attrs: Vec<String>,
}

fn attr_name(a: &NameAttribute) -> String {
    match a {
        NameAttribute::NoSelect => "\\Noselect".into(),
        NameAttribute::NoInferiors => "\\Noinferiors".into(),
        NameAttribute::Marked => "\\Marked".into(),
        NameAttribute::Unmarked => "\\Unmarked".into(),
        NameAttribute::Custom(c) => c.to_string(),
        #[allow(unreachable_patterns)]
        _ => String::new(),
    }
}

/// Signs in and lists every folder. Also the "does this password work" check when adding an account.
#[tauri::command]
pub async fn imap_folders(conn: Conn) -> Result<Vec<FolderInfo>, String> {
    blocking(move || {
        with_sess(&conn, |s| {
            let names = s.list(Some(""), Some("*")).map_err(es)?;
            Ok(names
                .iter()
                .map(|n| FolderInfo {
                    name: n.name().to_string(),
                    delimiter: n.delimiter().map(|d| d.to_string()),
                    attrs: n.attributes().iter().map(attr_name).filter(|a| !a.is_empty()).collect(),
                })
                .collect())
        })
    })
    .await
}

#[derive(Serialize)]
pub struct FolderState {
    folder: String,
    validity: u32,
    uidnext: u32,
    exists: u32,
    /// Every email in the folder with its flags. This is how deletions and read/starred changes are noticed.
    flags: Vec<(u32, Vec<String>)>,
    error: Option<String>,
}

/// For each folder: its identity numbers and the flags of every email in it, over one connection.
#[tauri::command]
pub async fn imap_flags(conn: Conn, folders: Vec<String>) -> Result<Vec<FolderState>, String> {
    blocking(move || {
        with_sess(&conn, |s| {
        let mut out = Vec::new();
        for folder in &folders {
            let mut st = FolderState { folder: folder.clone(), validity: 0, uidnext: 0, exists: 0, flags: Vec::new(), error: None };
            match s.examine(folder) {
                Ok(mb) => {
                    st.validity = mb.uid_validity.unwrap_or(0);
                    st.uidnext = mb.uid_next.unwrap_or(0);
                    st.exists = mb.exists;
                    if mb.exists > 0 {
                        match s.uid_fetch("1:*", "(UID FLAGS)") {
                            Ok(fetches) => {
                                for f in fetches.iter() {
                                    if let Some(uid) = f.uid {
                                        st.flags.push((uid, flags_of(f)));
                                    }
                                }
                            }
                            Err(e) => st.error = Some(es(e)),
                        }
                    }
                }
                Err(e) => st.error = Some(es(e)),
            }
            out.push(st);
        }
        Ok(out)
        })
    })
    .await
}

// ---------- reading ----------

#[derive(Serialize)]
pub struct UidList {
    validity: u32,
    uidnext: u32,
    uids: Vec<u32>,
}

/// The UIDs in a folder, all of them or only those since a date written like 01-Jan-2026.
#[tauri::command]
pub async fn imap_uids(conn: Conn, folder: String, since: Option<String>) -> Result<UidList, String> {
    blocking(move || {
        with_sess(&conn, |s| {
            let mb = s.examine(&folder).map_err(es)?;
            let mut uids = Vec::new();
            if mb.exists > 0 {
                let query = match &since {
                    Some(d) => format!("SINCE {}", d),
                    None => "ALL".to_string(),
                };
                uids = s.uid_search(query).map_err(es)?.into_iter().collect();
                uids.sort_unstable();
            }
            Ok(UidList { validity: mb.uid_validity.unwrap_or(0), uidnext: mb.uid_next.unwrap_or(0), uids })
        })
    })
    .await
}

#[derive(Serialize)]
pub struct RawMessage {
    uid: u32,
    flags: Vec<String>,
    /// When the server received it, in milliseconds since 1970.
    received: Option<i64>,
    /// The start of the email (headers and the first part of the body), base64.
    head: String,
}

/// The start of each listed email. The interface reads the headers and a preview from it.
#[tauri::command]
pub async fn imap_headers(conn: Conn, folder: String, uids: Vec<u32>) -> Result<Vec<RawMessage>, String> {
    blocking(move || {
        with_sess(&conn, |s| {
        s.examine(&folder).map_err(es)?;
        let query = format!("(UID FLAGS INTERNALDATE BODY.PEEK[]<0.{}>)", PREVIEW_BYTES);
        let mut out = Vec::new();
        for chunk in uids.chunks(CHUNK) {
            let fetches = s.uid_fetch(uid_set(chunk), &query).map_err(es)?;
            for f in fetches.iter() {
                let Some(uid) = f.uid else { continue };
                let bytes = f.body().or_else(|| f.header()).unwrap_or(&[]);
                out.push(RawMessage {
                    uid,
                    flags: flags_of(f),
                    received: f.internal_date().map(|d| d.timestamp_millis()),
                    head: B64.encode(bytes),
                });
            }
        }
        Ok(out)
        })
    })
    .await
}

/// One whole email, base64. Reading it does not mark it as read.
#[tauri::command]
pub async fn imap_message(conn: Conn, folder: String, uid: u32) -> Result<String, String> {
    blocking(move || {
        with_sess(&conn, |s| {
            s.examine(&folder).map_err(es)?;
            let fetches = s.uid_fetch(uid.to_string(), "(UID BODY.PEEK[])").map_err(es)?;
            let body = fetches.iter().find_map(|f| f.body()).ok_or_else(|| "The server did not return that email. It may have been moved or deleted.".to_string())?;
            Ok(B64.encode(body))
        })
    })
    .await
}

#[derive(Serialize)]
pub struct SearchHit {
    folder: String,
    uids: Vec<u32>,
}

/// Searches the text of the emails in some folders, newest 50 hits per folder.
#[tauri::command]
pub async fn imap_search(conn: Conn, folders: Vec<String>, text: String) -> Result<Vec<SearchHit>, String> {
    blocking(move || {
        with_sess(&conn, |s| {
        let mut out = Vec::new();
        for folder in &folders {
            if s.examine(folder).is_err() {
                continue;
            }
            let found = match s.uid_search(format!("TEXT \"{}\"", quote(&text))) {
                Ok(f) => f,
                Err(_) => continue,
            };
            let mut uids: Vec<u32> = found.into_iter().collect();
            uids.sort_unstable_by(|a, b| b.cmp(a));
            uids.truncate(50);
            if !uids.is_empty() {
                out.push(SearchHit { folder: folder.clone(), uids });
            }
        }
        Ok(out)
        })
    })
    .await
}

// ---------- changing things ----------

/// Adds and removes flags such as \Seen and \Flagged.
#[tauri::command]
pub async fn imap_store(conn: Conn, folder: String, uids: Vec<u32>, add: Vec<String>, remove: Vec<String>) -> Result<(), String> {
    blocking(move || {
        with_sess(&conn, |s| {
            s.select(&folder).map_err(es)?;
            let set = uid_set(&uids);
            if !add.is_empty() {
                s.uid_store(&set, format!("+FLAGS.SILENT ({})", add.join(" "))).map_err(es)?;
            }
            if !remove.is_empty() {
                s.uid_store(&set, format!("-FLAGS.SILENT ({})", remove.join(" "))).map_err(es)?;
            }
            Ok(())
        })
    })
    .await
}

fn copy_to(s: &mut Sess, set: &str, to: &str) -> Result<(), String> {
    if s.uid_copy(set, to).is_ok() {
        return Ok(());
    }
    // The folder may not exist yet (Archive, for one).
    let _ = s.create(to);
    s.uid_copy(set, to).map_err(es)
}

/// Moves (or copies) emails to another folder. Uses MOVE where the server has it, and copy then delete where not.
#[tauri::command]
pub async fn imap_move(conn: Conn, from: String, to: String, uids: Vec<u32>, copy: bool) -> Result<(), String> {
    blocking(move || {
        with_sess(&conn, |s| {
            s.select(&from).map_err(es)?;
            let set = uid_set(&uids);
            if copy {
                copy_to(s, &set, &to)?;
            } else if s.uid_mv(&set, &to).is_err() {
                copy_to(s, &set, &to)?;
                s.uid_store(&set, "+FLAGS.SILENT (\\Deleted)").map_err(es)?;
                s.expunge().map_err(es)?;
            }
            Ok(())
        })
    })
    .await
}

/// Deletes emails for good from a folder.
#[tauri::command]
pub async fn imap_delete(conn: Conn, folder: String, uids: Vec<u32>) -> Result<(), String> {
    blocking(move || {
        with_sess(&conn, |s| {
            s.select(&folder).map_err(es)?;
            s.uid_store(uid_set(&uids), "+FLAGS.SILENT (\\Deleted)").map_err(es)?;
            s.expunge().map_err(es)?;
            Ok(())
        })
    })
    .await
}

/// Deletes the emails in a folder that have a given Message-ID (how an old copy of a draft is replaced).
#[tauri::command]
pub async fn imap_delete_by_id(conn: Conn, folder: String, message_id: String) -> Result<(), String> {
    blocking(move || {
        with_sess(&conn, |s| {
            s.select(&folder).map_err(es)?;
            let found: Vec<u32> = s.uid_search(format!("HEADER Message-ID \"{}\"", quote(&message_id))).map_err(es)?.into_iter().collect();
            if !found.is_empty() {
                s.uid_store(uid_set(&found), "+FLAGS.SILENT (\\Deleted)").map_err(es)?;
                s.expunge().map_err(es)?;
            }
            Ok(())
        })
    })
    .await
}

/// Files a whole email in a folder (a copy for Sent, or a draft for Drafts).
#[tauri::command]
pub async fn imap_append(conn: Conn, folder: String, raw: String, flags: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let bytes = B64.decode(raw.as_bytes()).map_err(es)?;
        let mut flag_list: Vec<Flag> = Vec::new();
        for f in &flags {
            match f.as_str() {
                "\\Seen" => flag_list.push(Flag::Seen),
                "\\Draft" => flag_list.push(Flag::Draft),
                "\\Flagged" => flag_list.push(Flag::Flagged),
                _ => {}
            }
        }
        with_sess(&conn, |s| {
            if s.append_with_flags(&folder, &bytes, &flag_list).is_err() {
                let _ = s.create(&folder);
                s.append_with_flags(&folder, &bytes, &flag_list).map_err(es)?;
            }
            Ok(())
        })
    })
    .await
}

// ---------- sending ----------

#[derive(Deserialize)]
pub struct SmtpConn {
    host: String,
    port: u16,
    user: String,
    pass: String,
}

/// Sends a ready made email. `to` holds every recipient (To, Cc and Bcc); the email's own headers are sent as they are.
#[tauri::command]
pub async fn smtp_send(conn: SmtpConn, from: String, to: Vec<String>, raw: String) -> Result<(), String> {
    use lettre::address::Envelope;
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Address, SmtpTransport, Transport};

    blocking(move || {
        let bytes = B64.decode(raw.as_bytes()).map_err(es)?;
        let sender: Address = from.parse().map_err(|e| format!("The From address isn't valid: {}", e))?;
        let mut rcpts: Vec<Address> = Vec::new();
        for t in &to {
            rcpts.push(t.parse().map_err(|e| format!("{} isn't a valid address: {}", t, e))?);
        }
        let envelope = Envelope::new(Some(sender), rcpts).map_err(es)?;
        let builder = if conn.port == 465 { SmtpTransport::relay(&conn.host) } else { SmtpTransport::starttls_relay(&conn.host) }.map_err(es)?;
        let mailer = builder.port(conn.port).credentials(Credentials::new(conn.user, conn.pass)).build();
        mailer.send_raw(&envelope, &bytes).map_err(|e| format!("Sending failed: {}", e))?;
        Ok(())
    })
    .await
}
