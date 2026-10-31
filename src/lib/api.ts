/**
 * Wrappers tipados sobre o IPC do Tauri.
 *
 * Todo acesso ao backend passa por aqui (`UI-09`) e toda rejeição é
 * normalizada em `AppError`.
 */

import { invoke } from "@tauri-apps/api/core";

import { toAppError } from "./errors";
import type {
  AppState,
  AuthResult,
  CapsuleContent,
  CapsuleFilter,
  CapsuleSummary,
  CreateCapsuleInput,
  RevealResult,
} from "./types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error);
  }
}

export function getAppState(): Promise<AppState> {
  return call<AppState>("get_app_state");
}

export function setupMasterPassword(password: string): Promise<AuthResult> {
  return call<AuthResult>("setup_master_password", { password });
}

export function unlock(password: string): Promise<AuthResult> {
  return call<AuthResult>("unlock", { password });
}

export function lock(): Promise<void> {
  return call<void>("lock");
}

/** Informa ao backend que os listeners do webview já estão ativos. */
export function markFrontendReady(): Promise<void> {
  return call<void>("frontend_ready");
}

export function createCapsule(input: CreateCapsuleInput): Promise<CapsuleSummary> {
  return call<CapsuleSummary>("create_capsule", { input });
}

export function listCapsules(filter: CapsuleFilter): Promise<CapsuleSummary[]> {
  return call<CapsuleSummary[]>("list_capsules", { filter });
}

export function revealDue(): Promise<RevealResult> {
  return call<RevealResult>("reveal_due");
}

export function readCapsule(id: string): Promise<CapsuleContent> {
  return call<CapsuleContent>("read_capsule", { id });
}

export function archiveCapsule(id: string): Promise<CapsuleSummary> {
  return call<CapsuleSummary>("archive_capsule", { id });
}

export function deleteCapsule(id: string): Promise<void> {
  return call<void>("delete_capsule", { id });
}
