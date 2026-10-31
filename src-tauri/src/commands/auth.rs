//! Comandos de autenticação e estado da aplicação.

use std::sync::Mutex;
use std::time::Instant;

use serde_json::json;
use tauri::{Emitter, State};
use zeroize::Zeroizing;

use crate::crypto::{kdf, kdf::KdfParams, keycheck};
use crate::db::config;
use crate::error::AppError;
use crate::services::auth::{self, AppStateDto, AuthResult};
use crate::services::rate_limit;
use crate::state::{AppState, Session};

/// Retorna o estado atual sem exigir autenticação.
#[tauri::command]
pub fn get_app_state(state: State<'_, AppState>) -> Result<AppStateDto, AppError> {
    let (setup_completed, pending_reveals) = {
        let db = state.db.lock().map_err(|_| AppError::internal())?;
        (
            config::is_setup_completed(&db)?,
            auth::pending_reveals(&db)?,
        )
    };

    let unlocked = state
        .session
        .lock()
        .map_err(|_| AppError::internal())?
        .is_unlocked();

    Ok(AppStateDto {
        setup_completed,
        unlocked,
        pending_reveals,
        app_version: state.app.package_info().version.to_string(),
        crypto_format_version: config::CRYPTO_FORMAT_VERSION_CURRENT,
    })
}

/// Conclui o setup e abre a sessão.
#[tauri::command]
pub async fn setup_master_password(
    state: State<'_, AppState>,
    password: String,
) -> Result<AuthResult, AppError> {
    let password = Zeroizing::new(password);
    auth::validate_password(&password)?;

    {
        let db = state.db.lock().map_err(|_| AppError::internal())?;
        if config::is_setup_completed(&db)? {
            return Err(AppError::already_setup());
        }
    }

    let params = KdfParams::default();
    let (stored_setup, master_key) =
        tauri::async_runtime::spawn_blocking(move || auth::new_setup(password.as_str(), params))
            .await
            .map_err(|_| AppError::internal())??;

    let pending_reveals = {
        let mut db = state.db.lock().map_err(|_| AppError::internal())?;

        // Revalida após a derivação para não sobrescrever um setup concorrente.
        if config::is_setup_completed(&db)? {
            return Err(AppError::already_setup());
        }

        config::save_setup(&mut db, &stored_setup)?;
        auth::pending_reveals(&db)?
    };

    state
        .session
        .lock()
        .map_err(|_| AppError::internal())?
        .set_master_key(master_key);

    Ok(AuthResult {
        unlocked: true,
        pending_reveals,
    })
}

/// Valida a senha, aplica backoff e abre a sessão.
#[tauri::command]
pub async fn unlock(state: State<'_, AppState>, password: String) -> Result<AuthResult, AppError> {
    // 1. Backoff e leitura da configuração sem manter o banco durante Argon2id.
    let stored_setup = {
        let limiter = state.limiter.lock().map_err(|_| AppError::internal())?;
        rate_limit::ensure_allowed(&limiter, Instant::now())?;
        drop(limiter);

        let db = state.db.lock().map_err(|_| AppError::internal())?;
        config::load_setup(&db)?.ok_or_else(AppError::setup_required)?
    };

    // 2. Argon2id fora da thread da UI e sem o lock do banco.
    let params = KdfParams {
        m_kib: stored_setup.m_kib,
        t: stored_setup.t,
        p: stored_setup.p,
    };
    let salt = stored_setup.salt;
    let password = Zeroizing::new(password);

    let master_key = tauri::async_runtime::spawn_blocking(move || {
        kdf::derive_master_key(password.as_bytes(), &salt, &params)
    })
    .await
    .map_err(|_| AppError::internal())??;

    // 3. Reabre o banco e revalida o key-check persistido.
    let verification = {
        let db = state.db.lock().map_err(|_| AppError::internal())?;
        let current = config::load_setup(&db)?.ok_or_else(AppError::setup_required)?;
        keycheck::validate(&master_key, &current.key_check, &current.key_check_iv)
    };

    if let Err(error) = verification {
        let mut limiter = state.limiter.lock().map_err(|_| AppError::internal())?;
        rate_limit::record_failure(&mut limiter, Instant::now());
        return Err(error);
    }

    {
        let mut limiter = state.limiter.lock().map_err(|_| AppError::internal())?;
        rate_limit::record_success(&mut limiter);
    }

    let pending_reveals = {
        let db = state.db.lock().map_err(|_| AppError::internal())?;
        auth::pending_reveals(&db)?
    };

    state
        .session
        .lock()
        .map_err(|_| AppError::internal())?
        .set_master_key(master_key);

    Ok(AuthResult {
        unlocked: true,
        pending_reveals,
    })
}

/// Remove a Master Key da sessão. Idempotente.
#[tauri::command]
pub fn lock(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    lock_with(&state.session, || app.emit("auth://locked", json!({})))
}

/// Informa que o webview já registrou os listeners de eventos.
///
/// O primeiro tick de revelação aguarda este sinal para que o evento
/// `capsules://revealed` não seja perdido durante o boot.
#[tauri::command]
pub fn frontend_ready(state: State<'_, AppState>) {
    state.mark_frontend_ready();
}

fn lock_with<F>(session: &Mutex<Session>, emit: F) -> Result<(), AppError>
where
    F: FnOnce() -> Result<(), tauri::Error>,
{
    session.lock().map_err(|_| AppError::internal())?.clear();
    emit().map_err(|_| AppError::internal())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_clears_the_master_key_and_emits_event() {
        let session = Mutex::new(Session::default());
        session
            .lock()
            .unwrap()
            .unlock_with([5_u8; crate::state::MASTER_KEY_LEN]);
        let mut emitted = false;

        lock_with(&session, || {
            emitted = true;
            Ok(())
        })
        .expect("lock deve funcionar");

        assert!(!session.lock().unwrap().is_unlocked());
        assert!(emitted, "auth://locked deve ser emitido");
    }

    #[test]
    fn lock_is_idempotent_and_always_emits() {
        let session = Mutex::new(Session::default());
        let mut emissions = 0;

        lock_with(&session, || {
            emissions += 1;
            Ok(())
        })
        .expect("primeiro lock deve funcionar");
        lock_with(&session, || {
            emissions += 1;
            Ok(())
        })
        .expect("segundo lock deve funcionar");

        assert!(!session.lock().unwrap().is_unlocked());
        assert_eq!(emissions, 2);
    }
}
