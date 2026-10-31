//! Estado compartilhado da aplicação.
//!
//! A Master Key existe apenas em memória, dentro de [`Session`], e é
//! zeroizada ao bloquear, substituir a sessão ou encerrar o processo.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use rusqlite::Connection;
use tauri::AppHandle;
use zeroize::Zeroizing;

/// Tamanho da Master Key em bytes.
pub const MASTER_KEY_LEN: usize = 32;

/// Chave mestra protegida por zeroização automática ao ser descartada.
pub type MasterKey = Zeroizing<[u8; MASTER_KEY_LEN]>;

/// Sessão de autenticação mantida em memória.
#[derive(Default)]
pub struct Session {
    master_key: Option<MasterKey>,
}

impl Session {
    pub fn is_unlocked(&self) -> bool {
        self.master_key.is_some()
    }

    pub fn master_key(&self) -> Option<&[u8; MASTER_KEY_LEN]> {
        self.master_key.as_deref()
    }

    pub fn set_master_key(&mut self, master_key: MasterKey) {
        // A atribuição descarta a chave anterior, que é zeroizada pelo Zeroizing.
        self.master_key = Some(master_key);
    }

    pub fn unlock_with(&mut self, master_key: [u8; MASTER_KEY_LEN]) {
        self.set_master_key(Zeroizing::new(master_key));
    }

    pub fn clear(&mut self) {
        self.master_key = None;
    }
}

/// Estado do backoff de login.
#[derive(Default)]
pub struct RateLimiter {
    pub failed_attempts: u32,
    pub blocked_until: Option<Instant>,
}

impl RateLimiter {
    pub fn reset(&mut self) {
        self.failed_attempts = 0;
        self.blocked_until = None;
    }
}

/// Estado gerenciado pelo Tauri e compartilhado entre os comandos.
pub struct AppState {
    pub db: Mutex<Connection>,
    pub session: Mutex<Session>,
    pub limiter: Mutex<RateLimiter>,
    pub app: AppHandle,
    /// Sinaliza que o webview registrou os listeners de eventos.
    frontend_ready: AtomicBool,
}

impl AppState {
    pub fn new(db: Connection, app: AppHandle) -> Self {
        Self {
            db: Mutex::new(db),
            session: Mutex::new(Session::default()),
            limiter: Mutex::new(RateLimiter::default()),
            app,
            frontend_ready: AtomicBool::new(false),
        }
    }

    /// Marca o webview como pronto para receber eventos.
    pub fn mark_frontend_ready(&self) {
        self.frontend_ready.store(true, Ordering::Release);
    }

    pub fn is_frontend_ready(&self) -> bool {
        self.frontend_ready.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_starts_locked() {
        let session = Session::default();

        assert!(!session.is_unlocked());
        assert!(session.master_key().is_none());
    }

    #[test]
    fn session_can_be_unlocked_and_cleared() {
        let mut session = Session::default();
        session.unlock_with([7_u8; MASTER_KEY_LEN]);

        assert!(session.is_unlocked());
        assert_eq!(session.master_key(), Some(&[7_u8; MASTER_KEY_LEN]));

        session.clear();

        assert!(!session.is_unlocked());
        assert!(session.master_key().is_none());
    }

    #[test]
    fn rate_limiter_reset_clears_state() {
        let mut limiter = RateLimiter {
            failed_attempts: 4,
            blocked_until: Some(Instant::now()),
        };

        limiter.reset();

        assert_eq!(limiter.failed_attempts, 0);
        assert!(limiter.blocked_until.is_none());
    }
}
