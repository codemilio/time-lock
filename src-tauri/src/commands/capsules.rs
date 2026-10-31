//! Comandos de cápsulas.

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::error::AppError;
use crate::services::capsule::{
    self, CapsuleContent, CapsuleFilter, CapsuleSummary, CreateCapsuleInput,
};
use crate::services::reveal::{self, RevealResult};
use crate::state::AppState;

/// Cria uma cápsula cifrada e retorna seus metadados.
#[tauri::command]
pub fn create_capsule(
    state: State<'_, AppState>,
    input: CreateCapsuleInput,
) -> Result<CapsuleSummary, AppError> {
    let master_key = {
        let session = state.session.lock().map_err(|_| AppError::internal())?;
        capsule::require_key(&session)?
    };

    let mut db = state.db.lock().map_err(|_| AppError::internal())?;
    capsule::create(&mut db, &master_key, input)
}

/// Lista os metadados das cápsulas.
#[tauri::command]
pub fn list_capsules(
    state: State<'_, AppState>,
    filter: CapsuleFilter,
) -> Result<Vec<CapsuleSummary>, AppError> {
    {
        let session = state.session.lock().map_err(|_| AppError::internal())?;
        capsule::require_key(&session)?;
    }

    let db = state.db.lock().map_err(|_| AppError::internal())?;
    capsule::list(&db, &filter)
}

/// Transiciona cápsulas vencidas e anuncia as novas revelações.
///
/// Não exige sessão destravada: a transição não descriptografa conteúdo e
/// precisa continuar funcionando com o app bloqueado.
#[tauri::command]
pub fn reveal_due(app: AppHandle, state: State<'_, AppState>) -> Result<RevealResult, AppError> {
    let result = {
        let mut db = state.db.lock().map_err(|_| AppError::internal())?;
        reveal::reveal_due(&mut db)?
    };

    announce_revealed(&app, &result);
    Ok(result)
}

/// Lê e decifra uma cápsula revelada ou arquivada.
#[tauri::command]
pub fn read_capsule(state: State<'_, AppState>, id: String) -> Result<CapsuleContent, AppError> {
    let master_key = {
        let session = state.session.lock().map_err(|_| AppError::internal())?;
        capsule::require_key(&session)?
    };

    let db = state.db.lock().map_err(|_| AppError::internal())?;
    reveal::read(&db, &master_key, &id)
}

/// Arquiva uma cápsula revelada. Idempotente se já estiver arquivada.
#[tauri::command]
pub fn archive_capsule(state: State<'_, AppState>, id: String) -> Result<CapsuleSummary, AppError> {
    {
        let session = state.session.lock().map_err(|_| AppError::internal())?;
        capsule::require_key(&session)?;
    }

    let mut db = state.db.lock().map_err(|_| AppError::internal())?;
    capsule::archive(&mut db, &id)
}

/// Remove uma cápsula permanentemente e compacta o banco.
#[tauri::command]
pub fn delete_capsule(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    {
        let session = state.session.lock().map_err(|_| AppError::internal())?;
        capsule::require_key(&session)?;
    }

    let mut db = state.db.lock().map_err(|_| AppError::internal())?;
    capsule::delete(&mut db, &id)
}

/// Emite o evento e tenta a notificação somente após o commit da transição.
///
/// Falhas de emissão ou permissão de notificação são silenciosas: a
/// transição já foi persistida e o frontend ainda atualiza por `pendingReveals`.
pub(crate) fn announce_revealed(app: &AppHandle, result: &RevealResult) {
    if result.revealed == 0 {
        return;
    }

    let payload = json!({
        "count": result.revealed,
        "ids": result.ids,
    });
    let _ = app.emit("capsules://revealed", payload);

    let _ = app
        .notification()
        .builder()
        .title(reveal::NOTIFICATION_TITLE)
        .body(reveal::notification_body(result.revealed))
        .show();
}

/// Executa uma verificação de cápsulas vencidas no runtime.
///
/// Roda independentemente do login e ignora falhas de acesso ao banco para
/// que o próximo poll tente novamente.
pub(crate) fn reveal_tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let result = {
        let mut db = match state.db.lock() {
            Ok(db) => db,
            Err(_) => return,
        };
        reveal::reveal_due(&mut db)
    };

    if let Ok(result) = result {
        announce_revealed(app, &result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_reveal_result_has_nothing_to_announce() {
        let result = RevealResult {
            revealed: 0,
            ids: Vec::new(),
        };

        assert_eq!(result.revealed, 0);
        assert!(result.ids.is_empty());
    }
}
