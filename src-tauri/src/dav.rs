//! Contacts and calendars for accounts that offer them over CardDAV and CalDAV (iCloud first).
//!
//! These are ordinary web requests with unusual method names (PROPFIND, REPORT) and a sign in with the account's
//! app password. A web page can't send them freely, so this side does it. Redirects are not followed here: the
//! interface follows them itself, so it decides where the password is allowed to go.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest;

#[derive(Deserialize)]
pub struct DavRequest {
    url: String,
    method: String,
    user: String,
    pass: String,
    depth: Option<String>,
    body: Option<String>,
}

#[derive(Serialize)]
pub struct DavResponse {
    status: u16,
    /// Where a redirect points, if it is one.
    location: Option<String>,
    body: String,
}

#[tauri::command]
pub async fn dav_request(req: DavRequest) -> Result<DavResponse, String> {
    if !req.url.starts_with("https://") {
        return Err("Contacts and calendars are only fetched over https".into());
    }
    let method = reqwest::Method::from_bytes(req.method.as_bytes()).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let mut builder = client
        .request(method, &req.url)
        .basic_auth(&req.user, Some(&req.pass))
        .header("Content-Type", "application/xml; charset=utf-8");
    if let Some(d) = &req.depth {
        builder = builder.header("Depth", d.as_str());
    }
    if let Some(b) = req.body {
        builder = builder.body(b);
    }
    let res = builder.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let location = res.headers().get("location").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(DavResponse { status, location, body })
}
