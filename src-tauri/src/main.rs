// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Started by an AI app (Claude Desktop and others) to talk to the running Well Good Mail. No window, no tray.
    if std::env::args().any(|a| a == "--mcp") {
        well_good_mail_lib::mcp_passthrough();
        return;
    }
    well_good_mail_lib::run()
}
