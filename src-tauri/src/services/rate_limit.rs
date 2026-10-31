//! Política de backoff de login (`AUTH-08` a `AUTH-12`).
//!
//! O contador vive apenas em memória. O atraso é aplicado no backend; a UI
//! apenas reflete o `retry_after_ms` retornado por `unlock`.

use std::time::{Duration, Instant};

use crate::error::AppError;
use crate::state::RateLimiter;

/// Atraso máximo de backoff.
pub const MAX_DELAY: Duration = Duration::from_secs(30);

/// Retorna o atraso exigido após `failed_attempts` falhas consecutivas.
pub fn delay_for_failures(failed_attempts: u32) -> Option<Duration> {
    match failed_attempts {
        0..=2 => None,
        3 => Some(Duration::from_secs(1)),
        4 => Some(Duration::from_secs(2)),
        5 => Some(Duration::from_secs(4)),
        6 => Some(Duration::from_secs(8)),
        7 => Some(Duration::from_secs(16)),
        _ => Some(MAX_DELAY),
    }
}

/// Falha com `RATE_LIMITED` se o bloqueio ainda estiver ativo.
pub fn ensure_allowed(limiter: &RateLimiter, now: Instant) -> Result<(), AppError> {
    let Some(blocked_until) = limiter.blocked_until else {
        return Ok(());
    };

    if blocked_until <= now {
        return Ok(());
    }

    let remaining = blocked_until - now;
    let millis = u64::try_from(remaining.as_millis())
        .unwrap_or(MAX_DELAY.as_millis() as u64)
        .max(1);

    Err(AppError::rate_limited(millis))
}

/// Registra uma falha e agenda o próximo atraso.
pub fn record_failure(limiter: &mut RateLimiter, now: Instant) {
    limiter.failed_attempts = limiter.failed_attempts.saturating_add(1);
    limiter.blocked_until = delay_for_failures(limiter.failed_attempts).map(|delay| now + delay);
}

/// Zera o backoff após login bem-sucedido.
pub fn record_success(limiter: &mut RateLimiter) {
    limiter.reset();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delay_table_matches_spec() {
        assert_eq!(delay_for_failures(0), None);
        assert_eq!(delay_for_failures(1), None);
        assert_eq!(delay_for_failures(2), None);
        assert_eq!(delay_for_failures(3), Some(Duration::from_secs(1)));
        assert_eq!(delay_for_failures(4), Some(Duration::from_secs(2)));
        assert_eq!(delay_for_failures(5), Some(Duration::from_secs(4)));
        assert_eq!(delay_for_failures(6), Some(Duration::from_secs(8)));
        assert_eq!(delay_for_failures(7), Some(Duration::from_secs(16)));
        assert_eq!(delay_for_failures(8), Some(MAX_DELAY));
        assert_eq!(delay_for_failures(100), Some(MAX_DELAY));
    }

    #[test]
    fn third_failure_blocks_next_attempt() {
        let now = Instant::now();
        let mut limiter = RateLimiter::default();

        record_failure(&mut limiter, now);
        record_failure(&mut limiter, now);
        assert!(ensure_allowed(&limiter, now).is_ok());

        record_failure(&mut limiter, now);
        let error = ensure_allowed(&limiter, now).expect_err("terceira falha deve bloquear");

        assert_eq!(error.code, crate::error::ErrorCode::RateLimited);
        let retry_after = error
            .details
            .as_ref()
            .and_then(|details| details["retryAfterMs"].as_u64())
            .expect("retryAfterMs deve existir");
        assert!(retry_after > 0 && retry_after <= 1_000);
    }

    #[test]
    fn block_expires_after_the_delay() {
        let now = Instant::now();
        let mut limiter = RateLimiter::default();
        record_failure(&mut limiter, now);
        record_failure(&mut limiter, now);
        record_failure(&mut limiter, now);

        assert!(ensure_allowed(&limiter, now + Duration::from_secs(1)).is_ok());
    }

    #[test]
    fn success_resets_the_counter() {
        let now = Instant::now();
        let mut limiter = RateLimiter::default();
        record_failure(&mut limiter, now);
        record_failure(&mut limiter, now);
        record_failure(&mut limiter, now);

        record_success(&mut limiter);

        assert_eq!(limiter.failed_attempts, 0);
        assert!(limiter.blocked_until.is_none());
        assert!(ensure_allowed(&limiter, now).is_ok());

        record_failure(&mut limiter, now);
        assert_eq!(limiter.failed_attempts, 1);
        assert!(ensure_allowed(&limiter, now).is_ok());
    }
}
