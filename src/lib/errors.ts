/**
 * Erros da API Tauri e o mapeamento para mensagens PT-BR.
 *
 * O backend serializa `AppError` como `{ code, message, details? }` e o
 * `invoke` rejeita a promessa com esse objeto. Nada de detalhes internos
 * (SQL, caminhos ou mensagens de bibliotecas) é exibido ao usuário.
 */

/** Códigos do contrato da Seção 7.2. */
export const ERROR_CODES = [
  "SETUP_REQUIRED",
  "ALREADY_SETUP",
  "INVALID_PASSWORD",
  "RATE_LIMITED",
  "NOT_AUTHENTICATED",
  "CAPSULE_NOT_FOUND",
  "CAPSULE_NOT_DUE",
  "CAPSULE_NOT_READABLE",
  "INVALID_INPUT",
  "DB_ERROR",
  "CRYPTO_ERROR",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Mensagens estáveis para cada código (`API-01`). */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  SETUP_REQUIRED: "Configuração inicial necessária.",
  ALREADY_SETUP: "A configuração inicial já foi concluída.",
  INVALID_PASSWORD: "Senha incorreta. Tente novamente.",
  RATE_LIMITED: "Muitas tentativas. Aguarde para tentar novamente.",
  NOT_AUTHENTICATED: "Sua sessão foi bloqueada. Entre novamente.",
  CAPSULE_NOT_FOUND: "Cápsula não encontrada.",
  CAPSULE_NOT_DUE: "Esta cápsula ainda não pode ser aberta.",
  CAPSULE_NOT_READABLE: "Esta cápsula ainda não está disponível para leitura.",
  INVALID_INPUT: "Dados inválidos. Revise os campos e tente novamente.",
  DB_ERROR: "Não foi possível acessar seus dados. Tente novamente.",
  CRYPTO_ERROR: "Não foi possível abrir seus dados protegidos.",
  INTERNAL: "Algo deu errado. Tente novamente.",
};

export interface AppErrorDetails {
  field?: string;
  reason?: string;
  retryAfterMs?: number;
  [key: string]: unknown;
}

export interface AppErrorDto {
  code: ErrorCode;
  message?: string;
  details?: AppErrorDetails | null;
}

/** Erro tipado com código estável e detalhes opcionais. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: AppErrorDetails | null;

  constructor(code: ErrorCode, details: AppErrorDetails | null = null) {
    super(ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get field(): string | undefined {
    return this.details?.field;
  }

  get reason(): string | undefined {
    return this.details?.reason;
  }

  get retryAfterMs(): number | undefined {
    const value = this.details?.retryAfterMs;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

function asDetails(value: unknown): AppErrorDetails | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as AppErrorDetails;
}

/** Normaliza qualquer rejeição do `invoke` em um `AppError`. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const candidate = error as { code?: unknown; details?: unknown };

    if (isErrorCode(candidate.code)) {
      return new AppError(candidate.code, asDetails(candidate.details));
    }
  }

  return new AppError("INTERNAL");
}

/**
 * Mensagem exibível para o usuário.
 *
 * Para `RATE_LIMITED`, inclui a contagem em segundos exigida pela Seção 9.6.
 */
export function errorMessage(error: unknown): string {
  const appError = toAppError(error);

  if (appError.code === "RATE_LIMITED") {
    const milliseconds = appError.retryAfterMs;

    if (milliseconds !== undefined && milliseconds > 0) {
      const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
      return `Muitas tentativas. Aguarde ${seconds}s para tentar novamente.`;
    }
  }

  if (appError.code === "INVALID_INPUT" && appError.reason) {
    return appError.reason;
  }

  return ERROR_MESSAGES[appError.code];
}
