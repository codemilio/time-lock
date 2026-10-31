//! Criação e validação do key-check.
//!
//! O key-check valida a Master Key sem jamais persistir a senha ou um hash
//! dela (`SEC-11` a `SEC-14`). Falha de autenticação é sempre reportada como
//! `INVALID_PASSWORD`, sem distinguir senha errada de dado corrompido.

use crate::error::AppError;

use super::{KEY_LEN, NONCE_LEN, cipher, random_nonce};

/// Sentinela cifrada pelo key-check.
pub const SENTINEL: &[u8] = b"time-lock:keycheck:v1";

/// AAD do key-check, versionado.
pub const AAD: &[u8] = b"time-lock:keycheck:v1";

/// Dados persistidos do key-check.
#[derive(Debug, Clone)]
pub struct KeyCheck {
    pub ciphertext: Vec<u8>,
    pub iv: [u8; NONCE_LEN],
}

/// Cria um key-check novo para a Master Key informada.
pub fn create(master_key: &[u8; KEY_LEN]) -> Result<KeyCheck, AppError> {
    let iv = random_nonce()?;
    let ciphertext = cipher::encrypt_with_nonce(master_key, &iv, SENTINEL, AAD)?;

    Ok(KeyCheck { ciphertext, iv })
}

/// Valida a Master Key contra o key-check persistido.
///
/// Retorna `INVALID_PASSWORD` em qualquer falha, conforme `SEC-12`.
pub fn validate(master_key: &[u8; KEY_LEN], ciphertext: &[u8], iv: &[u8]) -> Result<(), AppError> {
    let plaintext = cipher::decrypt(master_key, iv, ciphertext, AAD)
        .map_err(|_| AppError::invalid_password())?;

    if plaintext.as_slice() != SENTINEL {
        return Err(AppError::invalid_password());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn master_key() -> [u8; KEY_LEN] {
        [9_u8; KEY_LEN]
    }

    #[test]
    fn key_check_accepts_correct_key() {
        let key_check = create(&master_key()).expect("key-check deve ser criado");

        validate(&master_key(), &key_check.ciphertext, &key_check.iv)
            .expect("key-check válido deve aceitar a MK");
    }

    #[test]
    fn key_check_rejects_wrong_password() {
        let key_check = create(&master_key()).expect("key-check deve ser criado");
        let wrong_key = [1_u8; KEY_LEN];

        let error = validate(&wrong_key, &key_check.ciphertext, &key_check.iv)
            .expect_err("senha errada deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidPassword);
    }

    #[test]
    fn key_check_rejects_corrupted_ciphertext() {
        let key_check = create(&master_key()).expect("key-check deve ser criado");
        let mut corrupted = key_check.ciphertext;
        corrupted[0] ^= 0xFF;

        let error = validate(&master_key(), &corrupted, &key_check.iv)
            .expect_err("key-check corrompido deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidPassword);
    }

    #[test]
    fn key_check_rejects_wrong_iv() {
        let key_check = create(&master_key()).expect("key-check deve ser criado");

        let error = validate(&master_key(), &key_check.ciphertext, &[0_u8; NONCE_LEN])
            .expect_err("IV errado deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidPassword);
    }

    #[test]
    fn key_check_uses_a_fresh_iv() {
        let first = create(&master_key()).expect("key-check deve ser criado");
        let second = create(&master_key()).expect("key-check deve ser criado");

        assert_ne!(first.iv, second.iv);
    }
}
