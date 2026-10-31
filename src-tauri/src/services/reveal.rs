//! Revelação, leitura e notificação de cápsulas.
//!
//! `reveal_due` nunca descriptografa nada; a leitura sob demanda acontece em
//! `read`, que revalida data e status antes de decifrar.

use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::Connection;
use serde::Serialize;
use zeroize::Zeroizing;

use crate::crypto::cipher;
use crate::db::capsules::{self, CapsuleSummaryRow};
use crate::error::AppError;
use crate::services::capsule::{self, CapsuleContent, CapsuleStatus};
use crate::state::MASTER_KEY_LEN;

/// Título fixo da notificação local (`NOTIF-01`).
pub const NOTIFICATION_TITLE: &str = "📬 Cápsula do Tempo";

/// Resultado de `reveal_due`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealResult {
    pub revealed: u32,
    pub ids: Vec<String>,
}

/// Corpo da notificação com pluralização correta (`NOTIF-02`).
pub fn notification_body(count: u32) -> String {
    if count == 1 {
        "Você tem 1 cápsula pronta para abrir!".to_owned()
    } else {
        format!("Você tem {count} cápsulas prontas para abrir!")
    }
}

/// Transiciona as cápsulas seladas vencidas, sem decifrar conteúdo.
pub fn reveal_due(connection: &mut Connection) -> Result<RevealResult, AppError> {
    let now = now_rfc3339();
    let ids = capsules::reveal_due(connection, &now)?;
    let revealed = u32::try_from(ids.len()).unwrap_or(u32::MAX);

    Ok(RevealResult { revealed, ids })
}

/// Lê e decifra uma cápsula revelada ou arquivada.
pub fn read(
    connection: &Connection,
    master_key: &[u8; MASTER_KEY_LEN],
    id: &str,
) -> Result<CapsuleContent, AppError> {
    let record = capsules::get_record(connection, id)?.ok_or_else(AppError::capsule_not_found)?;
    let status = CapsuleStatus::parse(&record.status)?;

    // REV-13, REV-15: data futura bloqueia a leitura em qualquer status.
    if parse_stored_date(&record.reveal_date)? > Utc::now() {
        return Err(AppError::capsule_not_due());
    }

    // REV-14: a transição de selada vencida é responsabilidade de `reveal_due`.
    if status == CapsuleStatus::Sealed {
        return Err(AppError::capsule_not_readable());
    }

    let aad = cipher::capsule_aad(&record.id, record.content_format_version);
    let content_key = cipher::decrypt(
        master_key,
        &record.iv_key,
        &record.encrypted_content_key,
        &aad,
    )?;

    if content_key.len() != MASTER_KEY_LEN {
        return Err(AppError::crypto_error());
    }

    let key = {
        let mut key = Zeroizing::new([0_u8; MASTER_KEY_LEN]);
        key.copy_from_slice(&content_key);
        key
    };

    let plaintext = cipher::decrypt(&key, &record.iv_content, &record.encrypted_content, &aad)?;

    let content = std::str::from_utf8(&plaintext)
        .map_err(|_| AppError::crypto_error())?
        .to_owned();

    Ok(CapsuleContent {
        summary: capsule::summary_from_row(CapsuleSummaryRow {
            id: record.id,
            title: record.title,
            reveal_date: record.reveal_date,
            status: record.status,
            created_at: record.created_at,
            revealed_at: record.revealed_at,
            archived_at: record.archived_at,
        })?,
        content,
    })
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
    use crate::services::capsule::{self, CapsuleFilter, CreateCapsuleInput};
    use crate::state::{MasterKey, Session};
    use chrono::Duration;
    use rusqlite::params;

    fn future_date(hours: i64) -> String {
        (Utc::now() + Duration::hours(hours)).to_rfc3339_opts(SecondsFormat::Millis, true)
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

        let key = capsule::require_key(&session).expect("sessão deve estar destravada");
        (connection, key)
    }

    fn create(
        connection: &mut Connection,
        key: &MasterKey,
        content: &str,
        hours: i64,
    ) -> capsule::CapsuleSummary {
        capsule::create(
            connection,
            key,
            CreateCapsuleInput {
                title: Some("Título".to_owned()),
                content: content.to_owned(),
                reveal_date: future_date(hours),
            },
        )
        .expect("cápsula deve ser criada")
    }

    fn make_due(connection: &Connection, id: &str) {
        connection
            .execute(
                "UPDATE capsules SET reveal_date = ?1 WHERE id = ?2",
                params![future_date(-1), id],
            )
            .expect("data deve ser atualizada");
    }

    fn make_future(connection: &Connection, id: &str) {
        connection
            .execute(
                "UPDATE capsules SET reveal_date = ?1 WHERE id = ?2",
                params![future_date(24), id],
            )
            .expect("data deve ser atualizada");
    }

    fn status(connection: &Connection, id: &str) -> String {
        connection
            .query_row(
                "SELECT status FROM capsules WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .expect("status deve existir")
    }

    #[test]
    fn reveal_due_transitions_expired_capsules() {
        let (mut connection, key) = setup();
        let due = create(&mut connection, &key, "vencida", 1);
        let future = create(&mut connection, &key, "futura", 48);
        make_due(&connection, &due.id);

        let result = reveal_due(&mut connection).expect("revelação deve funcionar");

        assert_eq!(result.revealed, 1);
        assert_eq!(result.ids, vec![due.id.clone()]);
        assert_eq!(status(&connection, &due.id), "revealed");
        assert_eq!(status(&connection, &future.id), "sealed");

        let revealed_at: Option<String> = connection
            .query_row(
                "SELECT revealed_at FROM capsules WHERE id = ?1",
                params![due.id],
                |row| row.get(0),
            )
            .expect("revealed_at deve existir");
        assert!(revealed_at.is_some());
    }

    #[test]
    fn reveal_due_is_idempotent() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "vencida", 1);
        make_due(&connection, &capsule.id);

        let first = reveal_due(&mut connection).expect("primeira revelação deve funcionar");
        let second = reveal_due(&mut connection).expect("segunda revelação deve funcionar");

        assert_eq!(first.revealed, 1);
        assert_eq!(second.revealed, 0);
        assert!(second.ids.is_empty());
    }

    #[test]
    fn reveal_due_does_not_decrypt_content() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "conteúdo", 1);
        make_due(&connection, &capsule.id);
        connection
            .execute(
                "UPDATE capsules SET encrypted_content = X'00' WHERE id = ?1",
                params![capsule.id],
            )
            .expect("blob deve ser corrompido");

        reveal_due(&mut connection).expect("transição não deve decifrar");
        assert_eq!(status(&connection, &capsule.id), "revealed");
    }

    #[test]
    fn read_future_sealed_returns_not_due() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "futuro", 24);

        let error = read(&connection, &key, &capsule.id).expect_err("leitura deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotDue);
    }

    #[test]
    fn read_due_but_sealed_returns_not_readable() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "vencida", 1);
        make_due(&connection, &capsule.id);

        let error = read(&connection, &key, &capsule.id).expect_err("leitura deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotReadable);
    }

    #[test]
    fn read_revealed_returns_exact_plaintext() {
        let (mut connection, key) = setup();
        let content = "Primeira linha\nSegunda linha\nAcentuação: ação, coração ❤";
        let capsule = create(&mut connection, &key, content, 1);
        make_due(&connection, &capsule.id);
        reveal_due(&mut connection).expect("revelação deve funcionar");

        let read = read(&connection, &key, &capsule.id).expect("leitura deve funcionar");

        assert_eq!(read.content, content);
        assert_eq!(read.summary.id, capsule.id);
        assert_eq!(read.summary.status, CapsuleStatus::Revealed);
    }

    #[test]
    fn read_archived_returns_content() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "arquivada", 1);
        make_due(&connection, &capsule.id);
        reveal_due(&mut connection).expect("revelação deve funcionar");
        capsule::archive(&mut connection, &capsule.id).expect("arquivamento deve funcionar");

        let read = read(&connection, &key, &capsule.id).expect("leitura deve funcionar");

        assert_eq!(read.content, "arquivada");
        assert_eq!(read.summary.status, CapsuleStatus::Archived);
    }

    #[test]
    fn missing_capsule_returns_not_found() {
        let (connection, key) = setup();

        let error = read(&connection, &key, "inexistente").expect_err("leitura deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotFound);
    }

    #[test]
    fn clock_rollback_blocks_revealed_read() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "conteúdo", 1);
        make_due(&connection, &capsule.id);
        reveal_due(&mut connection).expect("revelação deve funcionar");
        make_future(&connection, &capsule.id);

        let error = read(&connection, &key, &capsule.id).expect_err("leitura deve falhar");

        assert_eq!(error.code, ErrorCode::CapsuleNotDue);
    }

    #[test]
    fn tampered_ciphertext_returns_crypto_error() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "conteúdo", 1);
        make_due(&connection, &capsule.id);
        reveal_due(&mut connection).expect("revelação deve funcionar");

        let mut encrypted_content: Vec<u8> = connection
            .query_row(
                "SELECT encrypted_content FROM capsules WHERE id = ?1",
                params![capsule.id],
                |row| row.get(0),
            )
            .expect("blob deve existir");
        encrypted_content[0] ^= 0xFF;
        connection
            .execute(
                "UPDATE capsules SET encrypted_content = ?1 WHERE id = ?2",
                params![encrypted_content, capsule.id],
            )
            .expect("blob deve ser adulterado");

        let error = read(&connection, &key, &capsule.id).expect_err("leitura deve falhar");

        assert_eq!(error.code, ErrorCode::CryptoError);
    }

    #[test]
    fn swapped_blobs_fail_due_to_aad() {
        let (mut connection, key) = setup();
        let first = create(&mut connection, &key, "primeira", 1);
        let second = create(&mut connection, &key, "segunda", 1);
        make_due(&connection, &first.id);
        make_due(&connection, &second.id);
        reveal_due(&mut connection).expect("revelação deve funcionar");

        let (first_content, first_iv): (Vec<u8>, Vec<u8>) = connection
            .query_row(
                "SELECT encrypted_content, iv_content FROM capsules WHERE id = ?1",
                params![first.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("blobs devem existir");
        let (second_content, second_iv): (Vec<u8>, Vec<u8>) = connection
            .query_row(
                "SELECT encrypted_content, iv_content FROM capsules WHERE id = ?1",
                params![second.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("blobs devem existir");

        connection
            .execute(
                "UPDATE capsules SET encrypted_content = ?1, iv_content = ?2 WHERE id = ?3",
                params![second_content, second_iv, first.id],
            )
            .expect("blob deve ser trocado");
        connection
            .execute(
                "UPDATE capsules SET encrypted_content = ?1, iv_content = ?2 WHERE id = ?3",
                params![first_content, first_iv, second.id],
            )
            .expect("blob deve ser trocado");

        let first_error = read(&connection, &key, &first.id).expect_err("leitura deve falhar");
        let second_error = read(&connection, &key, &second.id).expect_err("leitura deve falhar");

        assert_eq!(first_error.code, ErrorCode::CryptoError);
        assert_eq!(second_error.code, ErrorCode::CryptoError);
    }

    #[test]
    fn reveal_result_serializes_camel_case() {
        let value = serde_json::to_value(RevealResult {
            revealed: 2,
            ids: vec!["a".to_owned(), "b".to_owned()],
        })
        .expect("resultado deve serializar");

        assert_eq!(value["revealed"], 2);
        assert_eq!(value["ids"][0], "a");
    }

    #[test]
    fn notification_body_pluralizes_correctly() {
        assert_eq!(
            notification_body(1),
            "Você tem 1 cápsula pronta para abrir!"
        );
        assert_eq!(
            notification_body(2),
            "Você tem 2 cápsulas prontas para abrir!"
        );
    }

    #[test]
    fn backup_copy_remains_readable_with_same_password() {
        // QA-BACKUP-01: o arquivo SQLite é autocontido.
        let dir = std::env::temp_dir().join(format!("time-lock-backup-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("diretório temporário deve ser criado");
        let original = dir.join("time-lock.db");
        let backup = dir.join("backup.db");

        let capsule_id = {
            let mut connection = crate::db::open(&original).expect("banco original deve abrir");
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

            let key = capsule::require_key(&session).expect("sessão deve estar destravada");
            let capsule = create(&mut connection, &key, "conteúdo do backup", 1);
            make_due(&connection, &capsule.id);
            reveal_due(&mut connection).expect("revelação deve funcionar");
            capsule.id
        };

        std::fs::copy(&original, &backup).expect("backup deve ser copiado");
        std::fs::remove_file(&original).expect("original deve ser removido");

        let connection = crate::db::open(&backup).expect("backup deve abrir");
        let mut session = Session::default();
        let mut limiter = crate::state::RateLimiter::default();
        auth::unlock(
            &connection,
            &mut session,
            &mut limiter,
            "senha muito segura",
        )
        .expect("mesma senha deve abrir o backup");
        let key = capsule::require_key(&session).expect("sessão deve estar destravada");
        let read = read(&connection, &key, &capsule_id).expect("cápsula deve ser lida");

        assert_eq!(read.content, "conteúdo do backup");

        drop(connection);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_due_is_the_only_transition_to_revealed() {
        let (mut connection, key) = setup();
        let capsule = create(&mut connection, &key, "conteúdo", 1);
        make_due(&connection, &capsule.id);

        let list = capsule::list(&connection, &CapsuleFilter::default()).expect("lista");
        assert_eq!(list[0].status, CapsuleStatus::Sealed);

        reveal_due(&mut connection).expect("revelação deve funcionar");
        let list = capsule::list(&connection, &CapsuleFilter::default()).expect("lista");
        assert_eq!(list[0].status, CapsuleStatus::Revealed);
    }
}
