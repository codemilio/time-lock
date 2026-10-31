//! Derivação da Master Key com Argon2id.
//!
//! Os parâmetros são versionados e persistidos em `app_config`; nunca são
//! fixados apenas no código para o login (`SEC-08`).

use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

use crate::error::AppError;
use crate::state::MasterKey;

use super::{KEY_LEN, random_bytes};

/// Tamanho mínimo do salt exigido pelo SPEC.
pub const SALT_LEN: usize = 16;

/// Memória padrão do Argon2id em KiB (64 MiB).
pub const DEFAULT_M_KIB: u32 = 65_536;

/// Iterações padrão do Argon2id.
pub const DEFAULT_T: u32 = 3;

/// Paralelismo padrão do Argon2id.
pub const DEFAULT_P: u32 = 1;

/// Parâmetros do Argon2id persistidos no setup.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KdfParams {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self {
            m_kib: DEFAULT_M_KIB,
            t: DEFAULT_T,
            p: DEFAULT_P,
        }
    }
}

impl KdfParams {
    /// Valida os limites aceitos pela implementação.
    pub fn validate(&self) -> Result<(), AppError> {
        if self.m_kib == 0 || self.t == 0 || self.p == 0 {
            return Err(AppError::crypto_error());
        }

        Params::new(self.m_kib, self.t, self.p, Some(KEY_LEN))
            .map(|_| ())
            .map_err(|_| AppError::crypto_error())
    }
}

/// Gera um salt novo de 16 bytes com CSPRNG.
pub fn generate_salt() -> Result<[u8; SALT_LEN], AppError> {
    random_bytes()
}

/// Deriva a Master Key de 32 bytes a partir da senha e do salt.
///
/// A saída é zeroizada automaticamente ao ser descartada.
pub fn derive_master_key(
    password: &[u8],
    salt: &[u8],
    params: &KdfParams,
) -> Result<MasterKey, AppError> {
    if salt.len() < SALT_LEN {
        return Err(AppError::crypto_error());
    }

    params.validate()?;

    let argon_params = Params::new(params.m_kib, params.t, params.p, Some(KEY_LEN))
        .map_err(|_| AppError::crypto_error())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);

    let mut output = Zeroizing::new([0_u8; KEY_LEN]);
    argon
        .hash_password_into(password, salt, output.as_mut())
        .map_err(|_| AppError::crypto_error())?;

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Parâmetros reduzidos para manter os testes rápidos.
    fn test_params() -> KdfParams {
        KdfParams {
            m_kib: 1_024,
            t: 1,
            p: 1,
        }
    }

    #[test]
    fn default_params_match_spec() {
        assert_eq!(
            KdfParams::default(),
            KdfParams {
                m_kib: 65_536,
                t: 3,
                p: 1,
            }
        );
        assert_eq!(SALT_LEN, 16);
        assert_eq!(KEY_LEN, 32);
    }

    #[test]
    fn same_password_and_salt_derive_same_key() {
        let salt = generate_salt().expect("salt deve ser gerado");
        let params = test_params();

        let first =
            derive_master_key(b"senha correta", &salt, &params).expect("derivação deve funcionar");
        let second =
            derive_master_key(b"senha correta", &salt, &params).expect("derivação deve funcionar");

        assert_eq!(first.as_ref(), second.as_ref());
    }

    #[test]
    fn different_salt_derives_different_key() {
        let params = test_params();
        let first_salt = generate_salt().expect("salt deve ser gerado");
        let second_salt = generate_salt().expect("salt deve ser gerado");

        let first = derive_master_key(b"senha correta", &first_salt, &params)
            .expect("derivação deve falhar");
        let second = derive_master_key(b"senha correta", &second_salt, &params)
            .expect("derivação deve falhar");

        assert_ne!(first.as_ref(), second.as_ref());
    }

    #[test]
    fn rejects_short_salt() {
        let error = derive_master_key(b"senha", &[0_u8; 8], &test_params())
            .expect_err("salt curto deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::CryptoError);
    }

    #[test]
    fn rejects_invalid_params() {
        for params in [
            KdfParams {
                m_kib: 0,
                t: 1,
                p: 1,
            },
            KdfParams {
                m_kib: 1_024,
                t: 0,
                p: 1,
            },
            KdfParams {
                m_kib: 1_024,
                t: 1,
                p: 0,
            },
        ] {
            assert_eq!(
                params.validate().expect_err("parâmetros inválidos").code,
                crate::error::ErrorCode::CryptoError
            );
        }
    }
}
