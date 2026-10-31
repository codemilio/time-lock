//! Cifra autenticada AES-256-GCM.
//!
//! Toda operação usa um nonce de 12 bytes gerado com CSPRNG e AAD explícito,
//! conforme `SEC-15` a `SEC-19`.

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use zeroize::Zeroizing;

use crate::error::AppError;

use super::{KEY_LEN, NONCE_LEN, random_nonce};

/// Resultado de uma operação de cifra.
#[derive(Debug, Clone)]
pub struct Encrypted {
    pub nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>,
}

/// Cifra `plaintext` com AES-256-GCM e o AAD informado.
pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8], aad: &[u8]) -> Result<Encrypted, AppError> {
    let nonce = random_nonce()?;
    let encrypted = encrypt_with_nonce(key, &nonce, plaintext, aad)?;

    Ok(Encrypted {
        nonce,
        ciphertext: encrypted,
    })
}

/// Cifra com um nonce já conhecido, útil para testes determinísticos.
pub fn encrypt_with_nonce(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, AppError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AppError::crypto_error())?;
    let nonce = Nonce::try_from(nonce.as_slice()).map_err(|_| AppError::crypto_error())?;

    cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| AppError::crypto_error())
}

/// Decifra `ciphertext` autenticando o AAD.
///
/// O plaintext é zeroizado ao ser descartado.
pub fn decrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8],
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, AppError> {
    if nonce.len() != NONCE_LEN {
        return Err(AppError::crypto_error());
    }

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AppError::crypto_error())?;
    let nonce = Nonce::try_from(nonce).map_err(|_| AppError::crypto_error())?;

    let plaintext = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| AppError::crypto_error())?;

    Ok(Zeroizing::new(plaintext))
}

/// Monta o AAD que amarra o ciphertext ao `id` e à versão do formato.
pub fn capsule_aad(id: &str, content_format_version: u32) -> Vec<u8> {
    format!("capsule:{id}:{content_format_version}").into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; KEY_LEN] {
        [7_u8; KEY_LEN]
    }

    #[test]
    fn round_trip_content() {
        let aad = capsule_aad("capsule-1", 1);
        let plaintext = b"mensagem para o futuro";

        let encrypted = encrypt(&key(), plaintext, &aad).expect("cifra deve funcionar");
        let decrypted = decrypt(&key(), &encrypted.nonce, &encrypted.ciphertext, &aad)
            .expect("decifra deve funcionar");

        assert_eq!(decrypted.as_slice(), plaintext);
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let aad = capsule_aad("capsule-1", 1);
        let encrypted = encrypt(&key(), b"segredo", &aad).expect("cifra deve funcionar");

        let mut tampered = encrypted.ciphertext;
        tampered[0] ^= 0xFF;

        let error = decrypt(&key(), &encrypted.nonce, &tampered, &aad)
            .expect_err("ciphertext adulterado deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn wrong_aad_fails() {
        let encrypted = encrypt(&key(), b"segredo", &capsule_aad("capsule-1", 1))
            .expect("cifra deve funcionar");

        let error = decrypt(
            &key(),
            &encrypted.nonce,
            &encrypted.ciphertext,
            &capsule_aad("capsule-2", 1),
        )
        .expect_err("AAD errado deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn distinct_capsules_use_distinct_nonces() {
        let aad = capsule_aad("capsule-1", 1);

        let first = encrypt(&key(), b"a", &aad).expect("cifra deve funcionar");
        let second = encrypt(&key(), b"b", &aad).expect("cifra deve funcionar");

        assert_ne!(first.nonce, second.nonce);
    }

    #[test]
    fn rejects_wrong_nonce_length() {
        let error = decrypt(&key(), &[0_u8; 8], b"ciphertext", b"aad")
            .expect_err("nonce curto deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn capsule_aad_binds_id_and_version() {
        assert_eq!(
            capsule_aad("abc", 1),
            b"capsule:abc:1".to_vec(),
            "AAD deve seguir o formato normativo"
        );
        assert_ne!(capsule_aad("abc", 1), capsule_aad("abc", 2));
        assert_ne!(capsule_aad("abc", 1), capsule_aad("def", 1));
    }
}
