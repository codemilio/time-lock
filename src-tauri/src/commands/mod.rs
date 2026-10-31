//! Comandos expostos ao frontend via IPC.
//!
//! Este módulo permanece fino: validação de borda, autorização e
//! mapeamento de erros. A lógica de domínio vive em `services`.

pub mod auth;
pub mod capsules;
