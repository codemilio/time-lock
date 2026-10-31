# ADR 0001 — Stack Tauri 2 + React + Rust

- **Status:** Aceito
- **Data:** Outubro de 2026

## Contexto

O produto é um aplicativo desktop Windows, offline-first, single-user, com requisitos fortes de
privacidade. O conteúdo precisa ser cifrado antes de tocar o disco e a lógica temporal não pode
depender do frontend.

## Decisão

- Shell desktop em **Tauri 2** com backend **Rust**.
- Frontend em **React + TypeScript strict**, empacotado com **Vite**.
- Estilização com **Tailwind CSS 4**.
- Persistência em **SQLite** via `rusqlite` (feature `bundled`).
- Criptografia no backend Rust com `argon2` e `aes-gcm`.
- Testes: `cargo test`, Vitest e Testing Library.

## Consequências

- Superfície de ataque menor que Electron e binário final compacto.
- O frontend é tratado como não confiável; nenhuma regra crítica depende dele.
- O projeto exige toolchain Rust MSVC e Build Tools no Windows.
- E2E automatizado fica fora do MVP por instabilidade do `tauri-driver` no Windows.
