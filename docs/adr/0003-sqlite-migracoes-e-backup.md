# ADR 0003 — SQLite, migrações e backup

- **Status:** Aceito
- **Data:** Outubro de 2026

## Contexto

O app é single-user e offline. O banco precisa ser portátil, não exigir servidor e permitir backup
manual simples. O conteúdo já é cifrado na aplicação, então criptografia do arquivo SQLite não é
necessária no MVP.

## Decisão

- SQLite embutido via `rusqlite` com a feature `bundled`.
- Banco em `app_data_dir()/time-lock.db`.
- Migrações versionadas com `PRAGMA user_version`; v1 cria `capsules` e `app_config`.
- `journal_mode = DELETE` e `synchronous = FULL` para manter um arquivo único e durável.
- `secure_delete = ON` e `VACUUM` após exclusão de cápsulas.
- Instância única via `tauri-plugin-single-instance` para evitar corrupção.
- Backup manual: fechar o app e copiar o `.db`.

## Consequências

- Backup/restore são operações de cópia de arquivo, documentadas na UI/README.
- Sem WAL, o desempenho de escrita é menor, mas irrelevante para o volume do MVP.
- Metadados (título, datas, status) permanecem em claro por decisão de produto.
- Alterações futuras de schema exigem nova migração e incremento de `user_version`.
