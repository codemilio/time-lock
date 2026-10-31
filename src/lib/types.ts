/**
 * DTOs espelhados do backend Rust (Seção 7.3 do SPEC).
 *
 * Campos seguem `camelCase`, conforme `serde(rename_all = "camelCase")`.
 */

export type CapsuleStatus = "sealed" | "revealed" | "archived";

/** Metadados de uma cápsula. Nunca contém conteúdo, chaves ou IVs. */
export interface CapsuleSummary {
  id: string;
  title: string | null;
  /** RFC3339 em UTC. */
  revealDate: string;
  status: CapsuleStatus;
  /** RFC3339 em UTC. */
  createdAt: string;
  revealedAt: string | null;
  archivedAt: string | null;
}

/** Cápsula com conteúdo decifrado, retornada apenas por `read_capsule`. */
export interface CapsuleContent extends CapsuleSummary {
  content: string;
}

export interface AppState {
  setupCompleted: boolean;
  unlocked: boolean;
  pendingReveals: number;
  appVersion: string;
  cryptoFormatVersion: number;
}

export interface AuthResult {
  unlocked: boolean;
  pendingReveals: number;
}

export interface CreateCapsuleInput {
  title: string | null;
  content: string;
  /** RFC3339 em UTC. */
  revealDate: string;
}

export interface CapsuleFilter {
  status: CapsuleStatus | null;
}

export interface RevealResult {
  revealed: number;
  ids: string[];
}

/** Payload do evento `capsules://revealed`. */
export interface RevealedEvent {
  count: number;
  ids: string[];
}

export const CAPSULE_STATUSES: readonly CapsuleStatus[] = ["sealed", "revealed", "archived"];
