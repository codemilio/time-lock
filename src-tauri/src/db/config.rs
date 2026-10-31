//! Repositório tipado de `app_config`.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use rusqlite::{Connection, OptionalExtension, params};

use crate::error::AppError;

pub const SETUP_COMPLETED: &str = "setup_completed";
pub const KDF_VERSION: &str = "kdf_version";
pub const ARGON2_SALT_B64: &str = "argon2_salt_b64";
pub const ARGON2_M_KIB: &str = "argon2_m_kib";
pub const ARGON2_T: &str = "argon2_t";
pub const ARGON2_P: &str = "argon2_p";
pub const CRYPTO_FORMAT_VERSION: &str = "crypto_format_version";
pub const KEY_CHECK_B64: &str = "key_check_b64";
pub const KEY_CHECK_IV_B64: &str = "key_check_iv_b64";

pub const KDF_VERSION_ARGON2ID_V19: &str = "argon2id-v19";
pub const CRYPTO_FORMAT_VERSION_CURRENT: u32 = 1;
pub const SALT_LEN: usize = 16;
pub const KEY_CHECK_IV_LEN: usize = 12;

/// Configuração persistida no setup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredSetup {
    pub kdf_version: String,
    pub salt: Vec<u8>,
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
    pub crypto_format_version: u32,
    pub key_check: Vec<u8>,
    pub key_check_iv: Vec<u8>,
}

/// Lê uma chave de configuração.
pub fn get(connection: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let value = connection
        .query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value)
}

/// Grava uma chave de configuração.
pub fn set(connection: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    connection.execute(
        "INSERT INTO app_config (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Indica se o setup foi concluído.
pub fn is_setup_completed(connection: &Connection) -> Result<bool, AppError> {
    Ok(get(connection, SETUP_COMPLETED)?.as_deref() == Some("true"))
}

/// Carrega a configuração do setup.
///
/// Retorna `None` quando o setup ainda não foi concluído. Se o setup constar
/// como concluído mas alguma chave estiver ausente ou inválida, retorna
/// `CRYPTO_ERROR` para impedir o login com uma configuração corrompida.
pub fn load_setup(connection: &Connection) -> Result<Option<StoredSetup>, AppError> {
    if !is_setup_completed(connection)? {
        return Ok(None);
    }

    let kdf_version = required(connection, KDF_VERSION)?;
    if kdf_version != KDF_VERSION_ARGON2ID_V19 {
        return Err(AppError::crypto_error());
    }

    let salt = decode_required(connection, ARGON2_SALT_B64)?;
    if salt.len() < SALT_LEN {
        return Err(AppError::crypto_error());
    }

    let key_check = decode_required(connection, KEY_CHECK_B64)?;
    if key_check.is_empty() {
        return Err(AppError::crypto_error());
    }

    let key_check_iv = decode_required(connection, KEY_CHECK_IV_B64)?;
    if key_check_iv.len() != KEY_CHECK_IV_LEN {
        return Err(AppError::crypto_error());
    }

    let setup = StoredSetup {
        kdf_version,
        salt,
        m_kib: parse_required(connection, ARGON2_M_KIB)?,
        t: parse_required(connection, ARGON2_T)?,
        p: parse_required(connection, ARGON2_P)?,
        crypto_format_version: parse_required(connection, CRYPTO_FORMAT_VERSION)?,
        key_check,
        key_check_iv,
    };

    if setup.m_kib == 0 || setup.t == 0 || setup.p == 0 {
        return Err(AppError::crypto_error());
    }
    if setup.crypto_format_version != CRYPTO_FORMAT_VERSION_CURRENT {
        return Err(AppError::crypto_error());
    }

    Ok(Some(setup))
}

/// Persiste toda a configuração do setup em uma única transação.
pub fn save_setup(connection: &mut Connection, setup: &StoredSetup) -> Result<(), AppError> {
    let transaction = connection.transaction()?;

    let entries = [
        (KDF_VERSION, setup.kdf_version.clone()),
        (ARGON2_SALT_B64, STANDARD.encode(&setup.salt)),
        (ARGON2_M_KIB, setup.m_kib.to_string()),
        (ARGON2_T, setup.t.to_string()),
        (ARGON2_P, setup.p.to_string()),
        (
            CRYPTO_FORMAT_VERSION,
            setup.crypto_format_version.to_string(),
        ),
        (KEY_CHECK_B64, STANDARD.encode(&setup.key_check)),
        (KEY_CHECK_IV_B64, STANDARD.encode(&setup.key_check_iv)),
        (SETUP_COMPLETED, "true".to_owned()),
    ];

    {
        let mut statement = transaction.prepare(
            "INSERT INTO app_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )?;

        for (key, value) in entries {
            statement.execute(params![key, value])?;
        }
    }

    transaction.commit()?;
    Ok(())
}

fn required(connection: &Connection, key: &str) -> Result<String, AppError> {
    get(connection, key)?.ok_or_else(AppError::crypto_error)
}

fn decode_required(connection: &Connection, key: &str) -> Result<Vec<u8>, AppError> {
    let encoded = required(connection, key)?;
    STANDARD
        .decode(encoded.as_bytes())
        .map_err(|_| AppError::crypto_error())
}

fn parse_required(connection: &Connection, key: &str) -> Result<u32, AppError> {
    required(connection, key)?
        .parse::<u32>()
        .map_err(|_| AppError::crypto_error())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrations, open_in_memory};

    fn sample_setup() -> StoredSetup {
        StoredSetup {
            kdf_version: KDF_VERSION_ARGON2ID_V19.to_owned(),
            salt: vec![1_u8; SALT_LEN],
            m_kib: 65_536,
            t: 3,
            p: 1,
            crypto_format_version: CRYPTO_FORMAT_VERSION_CURRENT,
            key_check: vec![2_u8; 32],
            key_check_iv: vec![3_u8; KEY_CHECK_IV_LEN],
        }
    }

    #[test]
    fn setup_round_trip() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let setup = sample_setup();

        save_setup(&mut connection, &setup).expect("setup deve salvar");
        let loaded = load_setup(&connection)
            .expect("setup deve carregar")
            .expect("setup deve existir");

        assert_eq!(loaded, setup);
        assert!(is_setup_completed(&connection).expect("flag deve ser lida"));
    }

    #[test]
    fn returns_none_before_setup() {
        let connection = open_in_memory().expect("banco deve abrir");

        assert!(!is_setup_completed(&connection).expect("flag deve ser lida"));
        assert!(
            load_setup(&connection)
                .expect("consulta deve funcionar")
                .is_none()
        );
    }

    #[test]
    fn missing_key_with_completed_setup_is_crypto_error() {
        let connection = open_in_memory().expect("banco deve abrir");
        set(&connection, SETUP_COMPLETED, "true").expect("flag deve salvar");

        let error = load_setup(&connection).expect_err("config ausente deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn unknown_kdf_version_is_crypto_error() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut setup = sample_setup();
        setup.kdf_version = "argon2id-v18".to_owned();
        save_setup(&mut connection, &setup).expect("setup deve salvar");

        let error = load_setup(&connection).expect_err("versão desconhecida deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn unknown_crypto_format_is_crypto_error() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut setup = sample_setup();
        setup.crypto_format_version = 99;
        save_setup(&mut connection, &setup).expect("setup deve salvar");

        let error = load_setup(&connection).expect_err("formato desconhecido deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn migration_creates_config_table() {
        let mut connection = rusqlite::Connection::open_in_memory().expect("banco deve abrir");
        migrations::run(&mut connection).expect("migração deve rodar");

        set(&connection, "chave", "valor").expect("config deve salvar");
        assert_eq!(
            get(&connection, "chave").expect("config deve carregar"),
            Some("valor".to_owned())
        );
    }
}
