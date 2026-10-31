import { describe, expect, it } from "vitest";

import {
  evaluatePassword,
  passwordByteLength,
  passwordCharLength,
  MAX_PASSWORD_BYTES,
} from "./password";

describe("password", () => {
  it("rejeita senha fraca com score abaixo de 3", () => {
    // AUTH-AC-03
    const strength = evaluatePassword("123456789012");

    expect(strength.score).toBeLessThan(3);
    expect(strength.warning).toBeTruthy();
  });

  it("aceita uma frase longa", () => {
    const strength = evaluatePassword("frase longa com palavras incomuns 42");

    expect(strength.score).toBeGreaterThanOrEqual(3);
  });

  it("conta caracteres Unicode e bytes UTF-8", () => {
    expect(passwordCharLength("ação")).toBe(4);
    expect(passwordCharLength("😀😀")).toBe(2);
    expect(passwordByteLength("ação")).toBe(6);
    expect(passwordByteLength("a".repeat(MAX_PASSWORD_BYTES))).toBe(MAX_PASSWORD_BYTES);
  });
});
