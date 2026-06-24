// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// Launch the bundled offline Python backend (`aimodule-backend`) as a sidecar
// bound to the loopback port the frontend talks to. Tauri shuts the child
// process down when the app exits.
fn spawn_backend(app: &tauri::AppHandle) {
    let sidecar = app
        .shell()
        .sidecar("aimodule-backend")
        .expect("aimodule-backend sidecar is missing from the bundle")
        .args(["--host", "127.0.0.1", "--port", "8756"]);

    let (mut rx, _child) = sidecar.spawn().expect("failed to start backend sidecar");

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stderr(line) | CommandEvent::Stdout(line) = event {
                println!("[backend] {}", String::from_utf8_lossy(&line));
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            spawn_backend(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AIModule");
}
