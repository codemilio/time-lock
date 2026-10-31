//! Repositório de cápsulas.
//!
//! Todos os acessos usam queries preparadas. O conteúdo e as chaves nunca
//! saem deste módulo em texto claro; apenas BLOBs cifrados são persistidos.

use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::error::AppError;

const SUMMARY_COLUMNS: &str =
    "id, title, reveal_date, status, created_at, revealed_at, archived_at";

/// Linha de cápsula a ser inserida.
#[derive(Debug, Clone)]
pub struct NewCapsule {
    pub id: String,
    pub title: Option<String>,
    pub encrypted_content: Vec<u8>,
    pub iv_content: Vec<u8>,
    pub encrypted_content_key: Vec<u8>,
    pub iv_key: Vec<u8>,
    pub content_format_version: u32,
    pub reveal_date: String,
    pub status: String,
    pub created_at: String,
}

/// Metadados de uma cápsula, sem BLOBs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapsuleSummaryRow {
    pub id: String,
    pub title: Option<String>,
    pub reveal_date: String,
    pub status: String,
    pub created_at: String,
    pub revealed_at: Option<String>,
    pub archived_at: Option<String>,
}

/// Linha completa de uma cápsula, incluindo os BLOBs cifrados.
#[derive(Debug, Clone)]
pub struct CapsuleRecord {
    pub id: String,
    pub title: Option<String>,
    pub encrypted_content: Vec<u8>,
    pub iv_content: Vec<u8>,
    pub encrypted_content_key: Vec<u8>,
    pub iv_key: Vec<u8>,
    pub content_format_version: u32,
    pub reveal_date: String,
    pub status: String,
    pub created_at: String,
    pub revealed_at: Option<String>,
    pub archived_at: Option<String>,
}

fn map_summary(row: &Row<'_>) -> rusqlite::Result<CapsuleSummaryRow> {
    Ok(CapsuleSummaryRow {
        id: row.get(0)?,
        title: row.get(1)?,
        reveal_date: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
        revealed_at: row.get(5)?,
        archived_at: row.get(6)?,
    })
}

/// Insere uma cápsula em transação.
pub fn insert(connection: &mut Connection, capsule: &NewCapsule) -> Result<(), AppError> {
    let transaction = connection.transaction()?;

    transaction.execute(
        "INSERT INTO capsules (
            id, title, encrypted_content, iv_content, encrypted_content_key, iv_key,
            content_format_version, reveal_date, status, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            capsule.id,
            capsule.title,
            capsule.encrypted_content,
            capsule.iv_content,
            capsule.encrypted_content_key,
            capsule.iv_key,
            capsule.content_format_version,
            capsule.reveal_date,
            capsule.status,
            capsule.created_at,
        ],
    )?;

    transaction.commit()?;
    Ok(())
}

/// Lista os metadados das cápsulas, opcionalmente filtrando por status.
///
/// Ordenação (`CAP-11`):
/// - `sealed`: `reveal_date ASC`;
/// - `revealed`: `revealed_at DESC`;
/// - `archived`: `archived_at DESC`;
/// - todos: `status ASC` e depois a regra do grupo.
pub fn list_summaries(
    connection: &Connection,
    status: Option<&str>,
) -> Result<Vec<CapsuleSummaryRow>, AppError> {
    let mut statement = connection.prepare(&format!(
        "SELECT {SUMMARY_COLUMNS}
         FROM capsules
         WHERE (?1 IS NULL OR status = ?1)
         ORDER BY
           status ASC,
           CASE WHEN status = 'sealed' THEN reveal_date END ASC,
           CASE WHEN status = 'revealed' THEN revealed_at
                WHEN status = 'archived' THEN archived_at END DESC"
    ))?;

    let rows = statement.query_map(params![status], map_summary)?;

    let mut summaries = Vec::new();
    for row in rows {
        summaries.push(row?);
    }

    Ok(summaries)
}

/// Busca os metadados de uma cápsula por ID.
pub fn get_summary(
    connection: &Connection,
    id: &str,
) -> Result<Option<CapsuleSummaryRow>, AppError> {
    let summary = connection
        .query_row(
            &format!("SELECT {SUMMARY_COLUMNS} FROM capsules WHERE id = ?1"),
            params![id],
            map_summary,
        )
        .optional()?;

    Ok(summary)
}

/// Busca a linha completa (incluindo BLOBs cifrados) por ID.
pub fn get_record(connection: &Connection, id: &str) -> Result<Option<CapsuleRecord>, AppError> {
    let mut statement = connection.prepare(
        "SELECT id, title, encrypted_content, iv_content, encrypted_content_key, iv_key,
                content_format_version, reveal_date, status, created_at, revealed_at, archived_at
         FROM capsules WHERE id = ?1",
    )?;

    let mut rows = statement.query(params![id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(CapsuleRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        encrypted_content: row.get(2)?,
        iv_content: row.get(3)?,
        encrypted_content_key: row.get(4)?,
        iv_key: row.get(5)?,
        content_format_version: row.get(6)?,
        reveal_date: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        revealed_at: row.get(10)?,
        archived_at: row.get(11)?,
    }))
}

/// Transiciona em uma única transação todas as cápsulas seladas vencidas.
///
/// O `UPDATE ... RETURNING` garante que apenas as linhas efetivamente
/// alteradas sejam retornadas, mesmo com chamadas concorrentes.
pub fn reveal_due(connection: &mut Connection, now: &str) -> Result<Vec<String>, AppError> {
    let transaction = connection.transaction()?;

    let mut ids = {
        let mut statement = transaction.prepare(
            "UPDATE capsules
             SET status = 'revealed', revealed_at = ?1
             WHERE status = 'sealed' AND reveal_date <= ?1
             RETURNING id",
        )?;

        let rows = statement.query_map(params![now], |row| row.get::<_, String>(0))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row?);
        }
        ids
    };

    transaction.commit()?;

    ids.sort();
    Ok(ids)
}

/// Marca uma cápsula revelada como arquivada.
///
/// Retorna `false` quando a linha não estava em `revealed`.
pub fn mark_archived(
    connection: &mut Connection,
    id: &str,
    archived_at: &str,
) -> Result<bool, AppError> {
    let transaction = connection.transaction()?;

    let updated = transaction.execute(
        "UPDATE capsules
         SET status = 'archived', archived_at = ?1
         WHERE id = ?2 AND status = 'revealed'",
        params![archived_at, id],
    )?;

    transaction.commit()?;
    Ok(updated == 1)
}

/// Remove a linha e confirma a transação.
///
/// Retorna `false` quando o ID não existia.
pub fn delete_row(connection: &mut Connection, id: &str) -> Result<bool, AppError> {
    let transaction = connection.transaction()?;

    let deleted = transaction.execute("DELETE FROM capsules WHERE id = ?1", params![id])?;

    transaction.commit()?;
    Ok(deleted == 1)
}

/// Compacta o arquivo do banco. Deve rodar fora de transações.
pub fn vacuum(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch("VACUUM")?;
    Ok(())
}

/// Conta cápsulas seladas cuja data de revelação já passou.
pub fn count_pending_reveals(connection: &Connection) -> Result<u32, AppError> {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM capsules WHERE status = 'sealed' AND reveal_date <= ?1",
        params![now],
        |row| row.get(0),
    )?;

    Ok(u32::try_from(count).unwrap_or(u32::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn sample(id: &str, reveal_date: &str) -> NewCapsule {
        NewCapsule {
            id: id.to_owned(),
            title: Some(format!("Título {id}")),
            encrypted_content: vec![1, 2, 3],
            iv_content: vec![0; 12],
            encrypted_content_key: vec![4, 5, 6],
            iv_key: vec![0; 12],
            content_format_version: 1,
            reveal_date: reveal_date.to_owned(),
            status: "sealed".to_owned(),
            created_at: "2026-01-01T00:00:00.000Z".to_owned(),
        }
    }

    #[test]
    fn insert_and_list_round_trip() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        insert(&mut connection, &sample("id-1", "2026-02-01T00:00:00.000Z"))
            .expect("insert deve funcionar");

        let rows = list_summaries(&connection, None).expect("listagem deve funcionar");

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "id-1");
        assert_eq!(rows[0].status, "sealed");
    }

    #[test]
    fn sealed_capsules_are_ordered_by_reveal_date() {
        let mut connection = open_in_memory().expect("banco deve abrir");
        insert(&mut connection, &sample("late", "2026-03-01T00:00:00.000Z"))
            .expect("insert deve funcionar");
        insert(&mut connection, &sample("soon", "2026-02-01T00:00:00.000Z"))
            .expect("insert deve funcionar");

        let rows = list_summaries(&connection, Some("sealed")).expect("listagem deve funcionar");

        assert_eq!(rows[0].id, "soon");
        assert_eq!(rows[1].id, "late");
    }
}
