//! Migrações versionadas do SQLite.

use rusqlite::Connection;

use crate::error::AppError;

/// Versão atual do schema.
pub const LATEST_VERSION: i64 = 1;

const V1_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS capsules (
  id                      TEXT PRIMARY KEY NOT NULL,
  title                   TEXT NULL,
  encrypted_content       BLOB NOT NULL,
  iv_content              BLOB NOT NULL CHECK (length(iv_content) = 12),
  encrypted_content_key   BLOB NOT NULL,
  iv_key                  BLOB NOT NULL CHECK (length(iv_key) = 12),
  content_format_version  INTEGER NOT NULL DEFAULT 1,
  reveal_date             TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('sealed', 'revealed', 'archived')),
  revealed_at             TEXT NULL,
  archived_at             TEXT NULL,
  created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capsules_status_reveal_date
  ON capsules (status, reveal_date);

CREATE TABLE IF NOT EXISTS app_config (
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT NOT NULL
);
"#;

/// Executa todas as migrações pendentes.
pub fn run(connection: &mut Connection) -> Result<(), AppError> {
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    match version {
        0 => migrate_v1(connection),
        LATEST_VERSION => Ok(()),
        // Um banco mais novo do que esta versão do app deve falhar de forma segura.
        _ => Err(AppError::db_error()),
    }
}

fn migrate_v1(connection: &mut Connection) -> Result<(), AppError> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(V1_SQL)?;
    transaction.execute_batch("PRAGMA user_version = 1;")?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user_version(connection: &Connection) -> i64 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("user_version deve ser consultável")
    }

    #[test]
    fn migration_v1_sets_user_version() {
        let mut connection = Connection::open_in_memory().expect("banco deve abrir");

        run(&mut connection).expect("migração deve rodar");

        assert_eq!(user_version(&connection), LATEST_VERSION);
    }

    #[test]
    fn migration_is_idempotent() {
        let mut connection = Connection::open_in_memory().expect("banco deve abrir");

        run(&mut connection).expect("primeira migração deve rodar");
        run(&mut connection).expect("segunda migração deve ser no-op");

        assert_eq!(user_version(&connection), LATEST_VERSION);

        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('capsules', 'app_config')",
                [],
                |row| row.get(0),
            )
            .expect("tabelas devem ser consultáveis");

        assert_eq!(table_count, 2);
    }

    #[test]
    fn rejects_newer_schema() {
        let mut connection = Connection::open_in_memory().expect("banco deve abrir");
        connection
            .execute_batch("PRAGMA user_version = 2;")
            .expect("pragma deve aplicar");

        let error = run(&mut connection).expect_err("schema futuro deve falhar");

        assert_eq!(error.code, crate::error::ErrorCode::DbError);
    }
}
