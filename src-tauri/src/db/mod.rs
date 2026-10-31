//! Acesso ao SQLite e inicialização do schema.

pub mod capsules;
pub mod config;
pub mod migrations;

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Nome do arquivo único do banco.
pub const DATABASE_FILE_NAME: &str = "time-lock.db";

/// Caminho canônico do banco em `app_data_dir()/time-lock.db`.
pub fn database_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::internal())?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(DATABASE_FILE_NAME))
}

/// Abre o banco, aplica os pragmas e executa as migrações.
pub fn open(path: &Path) -> Result<Connection, AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut connection = Connection::open(path)?;
    configure(&connection)?;
    migrations::run(&mut connection)?;

    Ok(connection)
}

/// Abre um banco em memória já migrado, para testes de repositório.
#[cfg(test)]
pub fn open_in_memory() -> Result<Connection, AppError> {
    let mut connection = Connection::open_in_memory()?;
    configure(&connection)?;
    migrations::run(&mut connection)?;
    Ok(connection)
}

/// Aplica os pragmas normativos em cada conexão.
pub fn configure(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch(
        "PRAGMA journal_mode = DELETE;
         PRAGMA synchronous = FULL;
         PRAGMA foreign_keys = ON;
         PRAGMA secure_delete = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pragma_i64(connection: &Connection, pragma: &str) -> i64 {
        connection
            .query_row(&format!("PRAGMA {pragma}"), [], |row| row.get(0))
            .expect("pragma deve ser consultável")
    }

    #[test]
    fn applies_normative_pragmas() {
        let directory = tempfile::tempdir().expect("diretório temporário deve ser criado");
        let path = directory.path().join("pragma.db");
        let connection = open(&path).expect("banco deve abrir");

        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("journal_mode deve ser consultável");

        assert_eq!(journal_mode.to_ascii_lowercase(), "delete");
        assert_eq!(pragma_i64(&connection, "synchronous"), 2);
        assert_eq!(pragma_i64(&connection, "foreign_keys"), 1);
        assert_eq!(pragma_i64(&connection, "secure_delete"), 1);
        assert_eq!(pragma_i64(&connection, "busy_timeout"), 5_000);
    }

    #[test]
    fn open_creates_missing_parent_directories_and_migrates() {
        let directory = tempfile::tempdir().expect("diretório temporário deve ser criado");
        let path = directory.path().join("nested").join("time-lock.db");

        let connection = open(&path).expect("banco deve abrir");

        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("user_version deve ser consultável");
        assert_eq!(version, migrations::LATEST_VERSION);
        assert!(path.exists());
    }
}
