//! Serviço de cápsulas: validação, cifra e listagem.

use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::crypto::{cipher, random_key};
use crate::db::capsules::{self, CapsuleSummaryRow, NewCapsule};
use crate::error::AppError;
use crate::state::{MasterKey, Session};

/// Limite máximo do corpo em bytes UTF-8 (`CAP-02`).
pub const MAX_CONTENT_BYTES: usize = 1_048_576;

/// Limite máximo do título em caracteres Unicode (`CAP-03`).
pub const MAX_TITLE_CHARS: usize = 80;

/// Versão atual do formato de conteúdo.
pub const CONTENT_FORMAT_VERSION: u32 = 1;

/// Status de uma cápsula.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapsuleStatus {
    Sealed,
    Revealed,
    Archived,
}

impl CapsuleStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sealed => "sealed",
            Self::Revealed => "revealed",
            Self::Archived => "archived",
        }
    }

    pub(crate) fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "sealed" => Ok(Self::Sealed),
            "revealed" => Ok(Self::Revealed),
            "archived" => Ok(Self::Archived),
            _ => Err(AppError::db_error()),
        }
    }
}

/// Converte uma linha persistida em DTO de metadados.
pub(crate) fn summary_from_row(row: CapsuleSummaryRow) -> Result<CapsuleSummary, AppError> {
    Ok(CapsuleSummary {
        id: row.id,
        title: row.title,
        reveal_date: row.reveal_date,
        status: CapsuleStatus::parse(&row.status)?,
        created_at: row.created_at,
        revealed_at: row.revealed_at,
        archived_at: row.archived_at,
    })
}

/// Entrada de `create_capsule`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCapsuleInput {
    pub title: Option<String>,
    pub content: String,
    pub reveal_date: String,
}

/// Metadados retornados ao frontend. Nunca inclui conteúdo, chaves ou IVs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapsuleSummary {
    pub id: String,
    pub title: Option<String>,
    pub reveal_date: String,
    pub status: CapsuleStatus,
    pub created_at: String,
    pub revealed_at: Option<String>,
    pub archived_at: Option<String>,
}

/// Cápsula com conteúdo decifrado, retornada apenas por `read_capsule`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapsuleContent {
    #[serde(flatten)]
    pub summary: CapsuleSummary,
    pub content: String,
}

/// Filtro de listagem.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapsuleFilter {
    pub status: Option<CapsuleStatus>,
}

/// Extrai a Master Key da sessão ou falha com `NOT_AUTHENTICATED`.
pub fn require_key(session: &Session) -> Result<MasterKey, AppError> {
    session
        .master_key()
        .map(|key| Zeroizing::new(*key))
        .ok_or_else(AppError::not_authenticated)
}

/// Valida a entrada, cifra o conteúdo e persiste a cápsula.
pub fn create(
    connection: &mut Connection,
    master_key: &[u8; 32],
    input: CreateCapsuleInput,
) -> Result<CapsuleSummary, AppError> {
    let CreateCapsuleInput {
        title,
        content,
        reveal_date,
    } = input;

    let content = Zeroizing::new(content);
    validate_content(&content)?;
    let title = normalize_title(title)?;
    let reveal_date = parse_reveal_date(&reveal_date)?;

    let id = Uuid::new_v4().to_string();
    let created_at = now_rfc3339();
    let aad = cipher::capsule_aad(&id, CONTENT_FORMAT_VERSION);

    let content_key = Zeroizing::new(random_key()?);
    let encrypted_content = cipher::encrypt(&content_key, content.as_bytes(), &aad)?;
    let encrypted_content_key = cipher::encrypt(master_key, content_key.as_ref(), &aad)?;

    let capsule = NewCapsule {
        id: id.clone(),
        title: title.clone(),
        encrypted_content: encrypted_content.ciphertext,
        iv_content: encrypted_content.nonce.to_vec(),
        encrypted_content_key: encrypted_content_key.ciphertext,
        iv_key: encrypted_content_key.nonce.to_vec(),
        content_format_version: CONTENT_FORMAT_VERSION,
        reveal_date: reveal_date.clone(),
        status: CapsuleStatus::Sealed.as_str().to_owned(),
        created_at: created_at.clone(),
    };

    capsules::insert(connection, &capsule)?;

    Ok(CapsuleSummary {
        id,
        title,
        reveal_date,
        status: CapsuleStatus::Sealed,
        created_at,
        revealed_at: None,
        archived_at: None,
    })
}

/// Lista cápsulas por status, sem expor BLOBs.
pub fn list(
    connection: &Connection,
    filter: &CapsuleFilter,
) -> Result<Vec<CapsuleSummary>, AppError> {
    let rows = capsules::list_summaries(connection, filter.status.map(CapsuleStatus::as_str))?;

    rows.into_iter().map(summary_from_row).collect()
}

/// Busca os metadados de uma cápsula ou falha com `CAPSULE_NOT_FOUND`.
pub fn get_summary(connection: &Connection, id: &str) -> Result<CapsuleSummary, AppError> {
    let row = capsules::get_summary(connection, id)?.ok_or_else(AppError::capsule_not_found)?;
    summary_from_row(row)
}

/// Arquiva uma cápsula revelada.
///
/// É idempotente quando a cápsula já está arquivada. Cápsulas seladas não
/// podem ser arquivadas (`ARC-02`, `ARC-04`) e o relógio retrocedido é
/// rejeitado (`ARC-05`).
pub fn archive(connection: &mut Connection, id: &str) -> Result<CapsuleSummary, AppError> {
    let row = capsules::get_summary(connection, id)?.ok_or_else(AppError::capsule_not_found)?;
    let status = CapsuleStatus::parse(&row.status)?;

    if status == CapsuleStatus::Sealed {
        return Err(AppError::capsule_not_readable());
    }

    if parse_stored_date(&row.reveal_date)? > Utc::now() {
        return Err(AppError::capsule_not_due());
    }

    if status == CapsuleStatus::Archived {
        return summary_from_row(row);
    }

    let archived_at = now_rfc3339();
    if !capsules::mark_archived(connection, id, &archived_at)? {
        // Outro fluxo pode ter arquivado a cápsula; recarrega o estado atual.
        return get_summary(connection, id);
    }

    get_summary(connection, id)
}

/// Remove uma cápsula de qualquer status e compacta o banco após o commit.
pub fn delete(connection: &mut Connection, id: &str) -> Result<(), AppError> {
    if !capsules::delete_row(connection, id)? {
        return Err(AppError::capsule_not_found());
    }

    // `VACUUM` não pode rodar dentro de uma transação; `delete_row` já commitou.
    capsules::vacuum(connection)?;
    Ok(())
}

fn validate_content(content: &str) -> Result<(), AppError> {
    if content.trim().is_empty() {
        return Err(AppError::invalid_input(
            "content",
            "O conteúdo não pode ser vazio.",
        ));
    }

    if content.len() > MAX_CONTENT_BYTES {
        return Err(AppError::invalid_input(
            "content",
            format!("O conteúdo não pode exceder {MAX_CONTENT_BYTES} bytes."),
        ));
    }

    Ok(())
}

fn normalize_title(title: Option<String>) -> Result<Option<String>, AppError> {
    let Some(title) = title else {
        return Ok(None);
    };

    let title = title.trim();
    if title.is_empty() {
        return Ok(None);
    }

    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::invalid_input(
            "title",
            format!("O título não pode exceder {MAX_TITLE_CHARS} caracteres."),
        ));
    }

    Ok(Some(title.to_owned()))
}

fn parse_reveal_date(value: &str) -> Result<String, AppError> {
    let parsed = DateTime::parse_from_rfc3339(value).map_err(|_| {
        AppError::invalid_input(
            "revealDate",
            "Informe uma data de revelação válida em RFC3339.",
        )
    })?;

    let reveal_date = parsed.with_timezone(&Utc);
    if reveal_date <= Utc::now() {
        return Err(AppError::invalid_input(
            "revealDate",
            "A data de revelação deve estar no futuro.",
        ));
    }

    Ok(reveal_date.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn parse_stored_date(value: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .map_err(|_| AppError::db_error())
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::kdf::KdfParams;
    use crate::db::open_in_memory;
    use crate::error::ErrorCode;
    use crate::services::auth;
    use crate::services::reveal;
    use chrono::Duration;
    use rusqlite::params;
    use std::fs;

    fn future_date(hours: i64) -> String {
        (Utc::now() + Duration::hours(hours)).to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    fn input(title: Option<&str>, content: &str, reveal_date: String) -> CreateCapsuleInput {
        CreateCapsuleInput {
            title: title.map(str::to_owned),
            content: content.to_owned(),
            reveal_date,
        }
    }

    fn setup() -> (Connection, MasterKey) {
        let mut connection = open_in_memory().expect("banco deve abrir");
        let mut session = Session::default();
        auth::setup_with_params(
            &mut connection,
            &mut session,
            "senha muito segura",
            KdfParams {
                m_kib: 1_024,
                t: 1,
                p: 1,
            },
        )
        .expect("setup deve funcionar");

        let key = require_key(&session).expect("sessão deve estar destravada");
        (connection, key)
    }

    #[test]
    fn create_returns_summary_without_content() {
        let (mut connection, key) = setup();

        let summary = create(
            &mut connection,
            &key,
            input(Some("Para o futuro"), "mensagem secreta", future_date(24)),
        )
        .expect("cápsula deve ser criada");

        assert_eq!(summary.title.as_deref(), Some("Para o futuro"));
        assert_eq!(summary.status, CapsuleStatus::Sealed);
        assert!(summary.revealed_at.is_none());
        assert!(summary.archived_at.is_none());

        let value = serde_json::to_value(&summary).expect("resumo deve serializar");
        assert!(value.get("content").is_none());
        assert!(value.get("encryptedContent").is_none());
        assert!(value.get("ivContent").is_none());

        let stored: Vec<u8> = connection
            .query_row(
                "SELECT encrypted_content FROM capsules WHERE id = ?1",
                params![summary.id],
                |row| row.get(0),
            )
            .expect("blob deve existir");
        assert!(
            !stored
                .windows(16)
                .any(|window| window == b"mensagem secreta")
        );
    }

    #[test]
    fn list_orders_sealed_by_reveal_date() {
        let (mut connection, key) = setup();

        let late = create(&mut connection, &key, input(None, "tarde", future_date(48)))
            .expect("cápsula deve ser criada");
        let soon = create(&mut connection, &key, input(None, "cedo", future_date(24)))
            .expect("cápsula deve ser criada");

        let list = list(&connection, &CapsuleFilter::default()).expect("listagem deve funcionar");

        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, soon.id);
        assert_eq!(list[1].id, late.id);
    }

    #[test]
    fn whitespace_title_becomes_null() {
        let (mut connection, key) = setup();

        let summary = create(
            &mut connection,
            &key,
            input(Some("   "), "conteúdo", future_date(1)),
        )
        .expect("cápsula deve ser criada");

        assert!(summary.title.is_none());
    }

    #[test]
    fn title_is_trimmed() {
        let (mut connection, key) = setup();

        let summary = create(
            &mut connection,
            &key,
            input(Some("  título  "), "conteúdo", future_date(1)),
        )
        .expect("cápsula deve ser criada");

        assert_eq!(summary.title.as_deref(), Some("título"));
    }

    #[test]
    fn empty_content_is_invalid() {
        let (mut connection, key) = setup();

        let error = create(
            &mut connection,
            &key,
            input(None, "   \n\t ", future_date(1)),
        )
        .expect_err("conteúdo vazio deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
        assert_eq!(error.details.as_ref().unwrap()["field"], "content");
    }

    #[test]
    fn content_above_limit_is_invalid() {
        let (mut connection, key) = setup();
        let content = "a".repeat(MAX_CONTENT_BYTES + 1);

        let error = create(&mut connection, &key, input(None, &content, future_date(1)))
            .expect_err("conteúdo grande deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
        assert_eq!(error.details.as_ref().unwrap()["field"], "content");
    }

    #[test]
    fn content_at_limit_is_accepted() {
        let (mut connection, key) = setup();
        let content = "a".repeat(MAX_CONTENT_BYTES);

        create(&mut connection, &key, input(None, &content, future_date(1)))
            .expect("conteúdo no limite deve ser aceito");
    }

    #[test]
    fn title_above_limit_is_invalid() {
        let (mut connection, key) = setup();
        let title = "a".repeat(MAX_TITLE_CHARS + 1);

        let error = create(
            &mut connection,
            &key,
            input(Some(&title), "conteúdo", future_date(1)),
        )
        .expect_err("título grande deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
        assert_eq!(error.details.as_ref().unwrap()["field"], "title");
    }

    #[test]
    fn past_date_is_invalid() {
        let (mut connection, key) = setup();

        let error = create(
            &mut connection,
            &key,
            input(None, "conteúdo", "2020-01-01T00:00:00.000Z".to_owned()),
        )
        .expect_err("data passada deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
        assert_eq!(error.details.as_ref().unwrap()["field"], "revealDate");
    }

    #[test]
    fn malformed_date_is_invalid() {
        let (mut connection, key) = setup();

        let error = create(
            &mut connection,
            &key,
            input(None, "conteúdo", "amanhã".to_owned()),
        )
        .expect_err("data inválida deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::InvalidInput);
        assert_eq!(error.details.as_ref().unwrap()["field"], "revealDate");
    }

    #[test]
    fn protected_operation_requires_session() {
        let session = Session::default();

        let error = require_key(&session).expect_err("sessão bloqueada deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::NotAuthenticated);
    }

    #[test]
    fn stored_ivs_have_12_bytes() {
        let (mut connection, key) = setup();
        let summary = create(
            &mut connection,
            &key,
            input(None, "conteúdo", future_date(1)),
        )
        .expect("cápsula deve ser criada");

        let (iv_content, iv_key): (Vec<u8>, Vec<u8>) = connection
            .query_row(
                "SELECT iv_content, iv_key FROM capsules WHERE id = ?1",
                params![summary.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("IVs devem existir");

        assert_eq!(iv_content.len(), 12);
        assert_eq!(iv_key.len(), 12);
        assert_ne!(iv_content, iv_key);
    }

    fn make_due(connection: &Connection, id: &str) {
        let past = (Utc::now() - Duration::hours(1)).to_rfc3339_opts(SecondsFormat::Millis, true);
        connection
            .execute(
                "UPDATE capsules SET reveal_date = ?1 WHERE id = ?2",
                params![past, id],
            )
            .expect("data deve ser atualizada");
    }

    fn create_revealed(
        connection: &mut Connection,
        key: &MasterKey,
        content: &str,
    ) -> CapsuleSummary {
        let summary = create(connection, key, input(None, content, future_date(1)))
            .expect("cápsula deve ser criada");
        make_due(connection, &summary.id);
        reveal::reveal_due(connection).expect("revelação deve funcionar");
        summary
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }

    #[test]
    fn archive_revealed_capsule() {
        let (mut connection, key) = setup();
        let capsule = create_revealed(&mut connection, &key, "conteúdo");

        let archived = archive(&mut connection, &capsule.id).expect("arquivamento deve funcionar");

        assert_eq!(archived.status, CapsuleStatus::Archived);
        assert!(archived.archived_at.is_some());

        let revealed = list(
            &connection,
            &CapsuleFilter {
                status: Some(CapsuleStatus::Revealed),
            },
        )
        .expect("lista de reveladas deve funcionar");
        assert!(revealed.is_empty());

        let archived_list = list(
            &connection,
            &CapsuleFilter {
                status: Some(CapsuleStatus::Archived),
            },
        )
        .expect("lista de arquivadas deve funcionar");
        assert_eq!(archived_list.len(), 1);
        assert_eq!(archived_list[0].id, capsule.id);
    }

    #[test]
    fn archive_sealed_capsule_is_not_readable() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, input(None, "selada", future_date(1)))
            .expect("cápsula deve ser criada");

        let error = archive(&mut connection, &capsule.id).expect_err("arquivamento deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotReadable);
    }

    #[test]
    fn archive_is_idempotent() {
        let (mut connection, key) = setup();
        let capsule = create_revealed(&mut connection, &key, "conteúdo");

        let first = archive(&mut connection, &capsule.id).expect("primeiro arquivamento");
        let second = archive(&mut connection, &capsule.id).expect("segundo arquivamento");

        assert_eq!(second.status, CapsuleStatus::Archived);
        assert_eq!(first.archived_at, second.archived_at);
    }

    #[test]
    fn archive_missing_capsule_is_not_found() {
        let (mut connection, _) = setup();

        let error = archive(&mut connection, "inexistente").expect_err("arquivamento deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotFound);
    }

    #[test]
    fn archive_with_clock_rollback_is_not_due() {
        let (mut connection, key) = setup();
        let capsule = create_revealed(&mut connection, &key, "conteúdo");
        connection
            .execute(
                "UPDATE capsules SET reveal_date = ?1 WHERE id = ?2",
                params![future_date(24), capsule.id],
            )
            .expect("data deve ser atualizada");

        let error = archive(&mut connection, &capsule.id).expect_err("arquivamento deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotDue);
    }

    #[test]
    fn delete_archived_capsule() {
        let (mut connection, key) = setup();
        let capsule = create_revealed(&mut connection, &key, "conteúdo");
        archive(&mut connection, &capsule.id).expect("arquivamento deve funcionar");

        delete(&mut connection, &capsule.id).expect("exclusão deve funcionar");

        let error = get_summary(&connection, &capsule.id).expect_err("cápsula deve sumir");
        assert_eq!(error.code, ErrorCode::CapsuleNotFound);
        let list = list(&connection, &CapsuleFilter::default()).expect("lista deve funcionar");
        assert!(list.is_empty());
    }

    #[test]
    fn delete_accepts_sealed_capsule() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, input(None, "selada", future_date(1)))
            .expect("cápsula deve ser criada");

        delete(&mut connection, &capsule.id).expect("exclusão deve funcionar");

        assert!(get_summary(&connection, &capsule.id).is_err());
    }

    #[test]
    fn delete_missing_capsule_is_not_found() {
        let (mut connection, _) = setup();

        let error = delete(&mut connection, "inexistente").expect_err("exclusão deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotFound);
    }

    #[test]
    fn delete_removes_row_and_marker_from_database_file() {
        let directory = tempfile::tempdir().expect("diretório temporário deve ser criado");
        let path = directory.path().join("time-lock.db");
        let mut connection = crate::db::open(&path).expect("banco deve abrir");
        let mut session = Session::default();
        auth::setup_with_params(
            &mut connection,
            &mut session,
            "senha muito segura",
            KdfParams {
                m_kib: 1_024,
                t: 1,
                p: 1,
            },
        )
        .expect("setup deve funcionar");
        let key = require_key(&session).expect("sessão deve estar destravada");
        let marker = "TESTE-SEGURANCA-42";
        let capsule = create(&mut connection, &key, input(None, marker, future_date(1)))
            .expect("cápsula deve ser criada");

        let bytes = fs::read(&path).expect("arquivo deve ser lido");
        assert!(
            !contains(&bytes, marker.as_bytes()),
            "marcador não deve aparecer nem antes da exclusão"
        );

        delete(&mut connection, &capsule.id).expect("exclusão deve funcionar");

        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM capsules", [], |row| row.get(0))
            .expect("contagem deve funcionar");
        assert_eq!(count, 0);

        let bytes = fs::read(&path).expect("arquivo deve ser lido");
        assert!(
            !contains(&bytes, marker.as_bytes()),
            "marcador não deve sobreviver à exclusão"
        );
    }
}
