import { describe, expect, it } from "vitest";

import { AppError, ERROR_CODES, ERROR_MESSAGES, errorMessage, toAppError } from "./errors";

describe("errors", () => {
  it("mapeia todos os ErrorCode para PT-BR", () => {
    // TEST-UI-05
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
      expect(ERROR_MESSAGES[code]).toMatch(/[A-Za-zÀ-ÿ]/);
    }

    expect(ERROR_MESSAGES.INVALID_PASSWORD).toBe("Senha incorreta. Tente novamente.");
    expect(ERROR_MESSAGES.CAPSULE_NOT_DUE).toBe("Esta cápsula ainda não pode ser aberta.");
  });

  it("normaliza o DTO de erro do backend", () => {
    const error = toAppError({
      code: "INVALID_INPUT",
      message: "Dados inválidos.",
      details: { field: "revealDate", reason: "A data deve estar no futuro." },
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.field).toBe("revealDate");
    expect(errorMessage(error)).toBe("A data deve estar no futuro.");
  });

  it("usa RATE_LIMITED com a contagem em segundos", () => {
    const error = toAppError({
      code: "RATE_LIMITED",
      details: { retryAfterMs: 2_400 },
    });

    expect(error.retryAfterMs).toBe(2_400);
    expect(errorMessage(error)).toBe("Muitas tentativas. Aguarde 3s para tentar novamente.");
  });

  it("cai em INTERNAL para payloads desconhecidos", () => {
    expect(toAppError(new Error("falha crua")).code).toBe("INTERNAL");
    expect(toAppError({ code: "CODIGO_DESCONHECIDO" }).code).toBe("INTERNAL");
    expect(toAppError(null).code).toBe("INTERNAL");
  });

  it("preserva instâncias de AppError", () => {
    const original = new AppError("CAPSULE_NOT_FOUND");

    expect(toAppError(original)).toBe(original);
  });
});
