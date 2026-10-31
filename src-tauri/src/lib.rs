mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod services;
pub mod state;

use std::time::{Duration, Instant};

use tauri::Manager;

use state::AppState;

/// Intervalo do poll de cápsulas vencidas (`REV-02`).
const REVEAL_POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Tempo máximo de espera pelo webview antes do primeiro tick.
///
/// O frontend chama `frontend_ready` depois de registrar os listeners; se o
/// webview falhar, o tick ainda roda como fallback.
const FRONTEND_READY_TIMEOUT: Duration = Duration::from_secs(10);
const FRONTEND_READY_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Margem para o StrictMode registrar os listeners definitivos em dev.
const FRONTEND_READY_SETTLE: Duration = Duration::from_millis(300);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let path = db::database_path(app.handle())?;
            let connection = db::open(&path)?;
            app.manage(AppState::new(connection, app.handle().clone()));

            spawn_reveal_check(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::get_app_state,
            commands::auth::setup_master_password,
            commands::auth::unlock,
            commands::auth::lock,
            commands::auth::frontend_ready,
            commands::capsules::create_capsule,
            commands::capsules::list_capsules,
            commands::capsules::reveal_due,
            commands::capsules::read_capsule,
            commands::capsules::archive_capsule,
            commands::capsules::delete_capsule
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação");
}

/// Verifica cápsulas vencidas imediatamente e a cada 60 segundos.
///
/// A tarefa roda no runtime assíncrono e continua ativa independentemente do
/// login (`REV-20`). A verificação em si roda em `spawn_blocking` por usar
/// SQLite de forma síncrona.
fn spawn_reveal_check(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Evita perder o evento de boot enquanto o webview ainda carrega.
        wait_for_frontend(&app).await;

        loop {
            let handle = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                commands::capsules::reveal_tick(&handle);
            })
            .await;

            tokio::time::sleep(REVEAL_POLL_INTERVAL).await;
        }
    });
}

/// Aguarda o frontend registrar os listeners, com timeout de segurança.
async fn wait_for_frontend(app: &tauri::AppHandle) {
    let deadline = Instant::now() + FRONTEND_READY_TIMEOUT;

    loop {
        let ready = app.state::<AppState>().is_frontend_ready();

        if ready {
            tokio::time::sleep(FRONTEND_READY_SETTLE).await;
            return;
        }

        if Instant::now() >= deadline {
            return;
        }

        tokio::time::sleep(FRONTEND_READY_POLL_INTERVAL).await;
    }
}
