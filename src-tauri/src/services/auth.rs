//! Serviço de autenticação: setup, unlock e metadados de sessão.
//!
//! A senha nunca é persistida nem registrada. A Master Key resultante é
//! guardada em [`Session`] e zeroizada ao bloquear.

use std::time::Instant;

use rusqlite::Connection;
use serde::Serialize;

use crate::crypto::{kdf, kdf::KdfParams, keycheck};
use crate::db::{capsules, config};
use crate::error::AppError;
use crate::state::{MasterKey, RateLimiter, Session};

use super::rate_limit;

/// Mínimo de caracteres Unicode da senha (`AUTH-01`).
pub const MIN_PASSWORD_CHARS: usize = 12;

/// Máximo de bytes UTF-8 da senha (`AUTH-01`).
pub const MAX_PASSWORD_BYTES: usize = 1024;

/// Resultado de setup/unlock.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub unlocked: bool,
    pub pending_reveals: u32,
}

/// Estado exposto ao frontend por `get_app_state`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateDto {
    pub setup_completed: bool,
    pub unlocked: bool,
    pub pending_reveals: u32,
    pub app_version: String,
    pub crypto_format_version: u32,
}

/// Valida o comprimento da senha (`AUTH-01`, `AUTH-14`).
pub fn validate_password(password: &str) -> Result<(), AppError> {
    if password.chars().count() < MIN_PASSWORD_CHARS {
        return Err(AppError::invalid_input(
            "password",
            format!("A senha deve ter pelo menos {MIN_PASSWORD_CHARS} caracteres."),
        ));
    }

    if password.len() > MAX_PASSWORD_BYTES {
        return Err(AppError::invalid_input(
            "password",
            format!("A senha deve ter no máximo {MAX_PASSWORD_BYTES} bytes."),
        ));
    }

    Ok(())
}

/// Gera salt, deriva a MK e cria o key-check para um novo setup.
///
/// Executa Argon2id; deve rodar em `spawn_blocking` no comando.
pub fn new_setup(
    password: &str,
    params: KdfParams,
) -> Result<(config::StoredSetup, MasterKey), AppError> {
    validate_password(password)?;

    let salt = kdf::generate_salt()?;
    let master_key = kdf::derive_master_key(password.as_bytes(), &salt, &params)?;
    let key_check = keycheck::create(&master_key)?;

    let setup = config::StoredSetup {
        kdf_version: config::KDF_VERSION_ARGON2ID_V19.to_owned(),
        salt: salt.to_vec(),
        m_kib: params.m_kib,
        t: params.t,
        p: params.p,
        crypto_format_version: config::CRYPTO_FORMAT_VERSION_CURRENT,
        key_check: key_check.ciphertext,
        key_check_iv: key_check.iv.to_vec(),
    };

    Ok((setup, master_key))
}

/// Deriva a MK com os parâmetros persistidos e valida o key-check.
///
/// Executa Argon2id; deve rodar em `spawn_blocking` no comando.
pub fn unlock_key(password: &str, setup: &config::StoredSetup) -> Result<MasterKey, AppError> {
    let params = KdfParams {
        m_kib: setup.m_kib,
        t: setup.t,
        p: setup.p,
    };

    let master_key = kdf::derive_master_key(password.as_bytes(), &setup.salt, &params)?;
    keycheck::validate(&master_key, &setup.key_check, &setup.key_check_iv)?;

    Ok(master_key)
}

/// Conta cápsulas seladas já vencidas, sem alterar estados.
pub fn pending_reveals(connection: &Connection) -> Result<u32, AppError> {
    capsules::count_pending_reveals(connection)
}

/// Executa o setup completo (caminho síncrono usado por testes e serviços).
pub fn setup(
    connection: &mut Connection,
    session: &mut Session,
    password: &str,
) -> Result<AuthResult, AppError> {
    setup_with_params(connection, session, password, KdfParams::default())
}

/// Executa o setup com parâmetros explícitos de KDF.
pub fn setup_with_params(
    connection: &mut Connection,
    session: &mut Session,
    password: &str,
    params: KdfParams,
) -> Result<AuthResult, AppError> {
    if config::is_setup_completed(connection)? {
        return Err(AppError::already_setup());
    }

    let (stored_setup, master_key) = new_setup(password, params)?;
    config::save_setup(connection, &stored_setup)?;

    session.set_master_key(master_key);
    let pending_reveals = pending_reveals(connection)?;

    Ok(AuthResult {
        unlocked: true,
        pending_reveals,
    })
}

/// Executa o login completo (caminho síncrono usado por testes e serviços).
pub fn unlock(
    connection: &Connection,
    session: &mut Session,
    limiter: &mut RateLimiter,
    password: &str,
) -> Result<AuthResult, AppError> {
    rate_limit::ensure_allowed(limiter, Instant::now())?;

    let Some(stored_setup) = config::load_setup(connection)? else {
        return Err(AppError::setup_required());
    };

    match unlock_key(password, &stored_setup) {
        Ok(master_key) => {
            rate_limit::record_success(limiter);
            session.set_master_key(master_key);
            Ok(AuthResult {
                unlocked: true,
                pending_reveals: pending_reveals(connection)?,
            })
        }
        Err(error) => {
            rate_limit::record_failure(limiter, Instant::now());
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn test_params() -> KdfParams {
        KdfParams {
            m_kib: 1_024,
            t: 1,
            p: 1,
        }
    }

    fn setup_db() -> (rusqlite::Connection, Session) {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut session = Session::default();

        setup_with_params(
            &mut connection,
            &mut session,
            "senha muito segura",
            test_params(),
        )
        .expect("setup deve funcionar");

        (connection, session)
    }

    #[test]
    fn setup_persists_config_and_opens_session() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut session = Session::default();

        let result = setup_with_params(
            &mut connection,
            &mut session,
            "senha muito segura",
            test_params(),
        )
        .expect("setup deve funcionar");

        assert!(result.unlocked);
        assert_eq!(result.pending_reveals, 0);
        assert!(session.is_unlocked());
        assert!(config::is_setup_completed(&connection).expect("flag deve ser lida"));

        let stored = config::load_setup(&connection)
            .expect("config deve carregar")
            .expect("setup deve existir");
        assert_eq!(stored.m_kib, 1_024);
        assert_eq!(stored.t, 1);
        assert_eq!(stored.p, 1);
    }

    #[test]
    fn second_setup_returns_already_setup() {
        let (mut connection, mut session) = setup_db();

        let error = setup_with_params(
            &mut connection,
            &mut session,
            "outra senha muito segura",
            test_params(),
        )
        .expect_err("setup duplicado deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::AlreadySetup);
    }

    #[test]
    fn unlock_with_correct_password_succeeds() {
        let (connection, _) = setup_db();
        let mut session = Session::default();
        let mut limiter = RateLimiter::default();

        let result = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha muito segura",
        )
        .expect("login deve funcionar");

        assert!(result.unlocked);
        assert!(session.is_unlocked());
        assert_eq!(limiter.failed_attempts, 0);
    }

    #[test]
    fn unlock_with_wrong_password_fails_and_counts() {
        let (connection, _) = setup_db();
        let mut session = Session::default();
        let mut limiter = RateLimiter::default();

        let error = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha errada mesmo",
        )
        .expect_err("senha errada deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidPassword);
        assert!(!session.is_unlocked());
        assert_eq!(limiter.failed_attempts, 1);
    }

    #[test]
    fn unlock_requires_setup() {
        let connection = open_in_memory().expect("banco deve abrir");
        let mut session = Session::default();
        let mut limiter = RateLimiter::default();

        let error = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha muito segura",
        )
        .expect_err("setup ausente deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::SetupRequired);
    }

    #[test]
    fn missing_config_is_crypto_error() {
        let connection = open_in_memory().expect("banco deve abrir");
        config::set(&connection, config::SETUP_COMPLETED, "true").expect("flag deve salvar");
        let mut session = Session::default();
        let mut limiter = RateLimiter::default();

        let error = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha muito segura",
        )
        .expect_err("config corrompida deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn backoff_blocks_after_three_failures() {
        let (connection, _) = setup_db();
        let mut session = Session::default();
        let mut limiter = RateLimiter::default();

        for _ in 0..3 {
            let _ = unlock(
                &connection,
                &mut session,
                &mut limiter,
                "senha errada mesmo",
            );
        }

        let error = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha muito segura",
        )
        .expect_err("backoff deve bloquear");

        assert_eq!(error.code, crate::error::ErrorCode::RateLimited);
        let retry_after = error
            .details
            .as_ref()
            .and_then(|details| details["retryAfterMs"].as_u64())
            .expect("retryAfterMs deve existir");
        assert!(retry_after > 0 && retry_after <= 1_000);
    }

    #[test]
    fn successful_login_resets_backoff() {
        let (connection, _) = setup_db();
        let mut session = Session::default();
        let mut limiter = RateLimiter::default();

        let _ = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha errada mesmo",
        );
        let _ = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha errada mesmo",
        );
        unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha muito segura",
        )
        .expect("login deve funcionar");

        let error = unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha errada mesmo",
        )
        .expect_err("senha errada deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidPassword);
        assert_eq!(limiter.failed_attempts, 1);
    }

    #[test]
    fn short_password_is_invalid_input() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut session = Session::default();

        let error = setup_with_params(&mut connection, &mut session, "curta", test_params())
            .expect_err("senha curta deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
        assert_eq!(error.details.as_ref().unwrap()["field"], "password");
    }

    #[test]
    fn password_longer_than_1024_bytes_is_invalid_input() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut session = Session::default();
        let password = "a".repeat(MAX_PASSWORD_BYTES + 1);

        let error = setup_with_params(&mut connection, &mut session, &password, test_params())
            .expect_err("senha longa deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
    }
}
