//! Erros de domínio e o envelope serializado para o frontend.
//!
//! As mensagens são estáveis, em PT-BR e nunca expõem detalhes internos,
//! SQL, caminhos ou mensagens de bibliotecas criptográficas.

use serde::Serialize;
use serde_json::{Value, json};

/// Códigos de erro do contrato da API Tauri.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    SetupRequired,
    AlreadySetup,
    InvalidPassword,
    RateLimited,
    NotAuthenticated,
    CapsuleNotFound,
    CapsuleNotDue,
    CapsuleNotReadable,
    InvalidInput,
    DbError,
    CryptoError,
    Internal,
}

impl ErrorCode {
    pub fn default_message(self) -> &'static str {
        match self {
            Self::SetupRequired => "Configuração inicial necessária.",
            Self::AlreadySetup => "A configuração inicial já foi concluída.",
            Self::InvalidPassword => "Senha incorreta. Tente novamente.",
            Self::RateLimited => "Muitas tentativas. Aguarde para tentar novamente.",
            Self::NotAuthenticated => "Sessão bloqueada. Desbloqueie para continuar.",
            Self::CapsuleNotFound => "Cápsula não encontrada.",
            Self::CapsuleNotDue => "Esta cápsula ainda não pode ser aberta.",
            Self::CapsuleNotReadable => "Esta cápsula não pode ser lida no estado atual.",
            Self::InvalidInput => "Dados inválidos.",
            Self::DbError => "Não foi possível acessar os dados.",
            Self::CryptoError => "Não foi possível validar os dados criptográficos.",
            Self::Internal => "Ocorreu um erro inesperado.",
        }
    }
}

/// Envelope de erro retornado por todos os comandos.
#[derive(Debug, Clone, serde::Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl AppError {
    pub fn new(code: ErrorCode) -> Self {
        Self {
            code,
            message: code.default_message().to_owned(),
            details: None,
        }
    }

    pub fn with_message(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn invalid_input(field: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::InvalidInput,
            message: ErrorCode::InvalidInput.default_message().to_owned(),
            details: Some(json!({
                "field": field.into(),
                "reason": reason.into(),
            })),
        }
    }

    pub fn rate_limited(retry_after_ms: u64) -> Self {
        Self {
            code: ErrorCode::RateLimited,
            message: ErrorCode::RateLimited.default_message().to_owned(),
            details: Some(json!({ "retryAfterMs": retry_after_ms })),
        }
    }

    pub fn setup_required() -> Self {
        Self::new(ErrorCode::SetupRequired)
    }

    pub fn already_setup() -> Self {
        Self::new(ErrorCode::AlreadySetup)
    }

    pub fn invalid_password() -> Self {
        Self::new(ErrorCode::InvalidPassword)
    }

    pub fn not_authenticated() -> Self {
        Self::new(ErrorCode::NotAuthenticated)
    }

    pub fn capsule_not_found() -> Self {
        Self::new(ErrorCode::CapsuleNotFound)
    }

    pub fn capsule_not_due() -> Self {
        Self::new(ErrorCode::CapsuleNotDue)
    }

    pub fn capsule_not_readable() -> Self {
        Self::new(ErrorCode::CapsuleNotReadable)
    }

    pub fn db_error() -> Self {
        Self::new(ErrorCode::DbError)
    }

    pub fn crypto_error() -> Self {
        Self::new(ErrorCode::CryptoError)
    }

    pub fn internal() -> Self {
        Self::new(ErrorCode::Internal)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(_: rusqlite::Error) -> Self {
        Self::db_error()
    }
}

impl From<std::io::Error> for AppError {
    fn from(_: std::io::Error) -> Self {
        Self::db_error()
    }
}

impl From<serde_json::Error> for AppError {
    fn from(_: serde_json::Error) -> Self {
        Self::internal()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_error_with_camel_case_details() {
        let error = AppError::invalid_input("content", "não pode ser vazio");
        let value = serde_json::to_value(error).expect("erro deve serializar");

        assert_eq!(value["code"], "INVALID_INPUT");
        assert_eq!(value["message"], "Dados inválidos.");
        assert_eq!(value["details"]["field"], "content");
        assert_eq!(value["details"]["reason"], "não pode ser vazio");
    }

    #[test]
    fn serializes_rate_limited_retry_after() {
        let error = AppError::rate_limited(1_000);
        let value = serde_json::to_value(error).expect("erro deve serializar");

        assert_eq!(value["code"], "RATE_LIMITED");
        assert_eq!(value["details"]["retryAfterMs"], 1_000);
    }

    #[test]
    fn omits_details_when_absent() {
        let error = AppError::not_authenticated();
        let value = serde_json::to_value(error).expect("erro deve serializar");

        assert_eq!(value["code"], "NOT_AUTHENTICATED");
        assert!(value.get("details").is_none());
    }
}
