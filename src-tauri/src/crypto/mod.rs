//! Primitivas criptográficas do Cápsula do Tempo.
//!
//! Toda a hierarquia de chaves é implementada aqui. As funções são puras e
//! não registram segredos; a execução em thread bloqueante fica a cargo dos
//! serviços (ver `NFR-01`).

pub mod cipher;
pub mod kdf;
pub mod keycheck;

use rand::{TryRng, rngs::SysRng};

use crate::error::AppError;

/// Tamanho da chave AES-256 em bytes.
pub const KEY_LEN: usize = 32;

/// Tamanho do nonce/IV do AES-GCM em bytes.
pub const NONCE_LEN: usize = 12;

/// Gera `N` bytes com CSPRNG do sistema operacional.
pub fn random_bytes<const N: usize>() -> Result<[u8; N], AppError> {
    let mut bytes = [0_u8; N];
    SysRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| AppError::crypto_error())?;
    Ok(bytes)
}

/// Gera um nonce único de 12 bytes.
pub fn random_nonce() -> Result<[u8; NONCE_LEN], AppError> {
    random_bytes()
}

/// Gera uma chave de 256 bits para uso como Content Key.
pub fn random_key() -> Result<[u8; KEY_LEN], AppError> {
    random_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_nonces_differ() {
        let first = random_nonce().expect("nonce deve ser gerado");
        let second = random_nonce().expect("nonce deve ser gerado");

        assert_ne!(first, second);
    }

    #[test]
    fn random_keys_differ() {
        let first = random_key().expect("chave deve ser gerada");
        let second = random_key().expect("chave deve ser gerada");

        assert_ne!(first, second);
    }
}
