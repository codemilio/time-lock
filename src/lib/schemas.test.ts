import { describe, expect, it } from "vitest";

import { utcToDatetimeLocal } from "./dates";
import { MAX_CAPSULE_CONTENT_BYTES, MAX_CAPSULE_TITLE_CHARS, newCapsuleSchema } from "./schemas";

function futureLocal(hours = 24): string {
  return utcToDatetimeLocal(new Date(Date.now() + hours * 3_600_000).toISOString());
}

function pastLocal(hours = 1): string {
  return utcToDatetimeLocal(new Date(Date.now() - hours * 3_600_000).toISOString());
}

function input(overrides: Record<string, string> = {}) {
  return {
    title: "Para o futuro",
    content: "Uma mensagem secreta.",
    revealDate: futureLocal(),
    ...overrides,
  };
}

describe("newCapsuleSchema", () => {
  it("aceita exatamente 1 MB e rejeita 1 MB + 1 byte", () => {
    // TEST-UI-01
    const accepted = newCapsuleSchema.safeParse(
      input({ content: "a".repeat(MAX_CAPSULE_CONTENT_BYTES) }),
    );
    const rejected = newCapsuleSchema.safeParse(
      input({ content: "a".repeat(MAX_CAPSULE_CONTENT_BYTES + 1) }),
    );

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it("aceita título de 80 caracteres e rejeita 81", () => {
    // TEST-UI-02
    const accepted = newCapsuleSchema.safeParse(
      input({ title: "a".repeat(MAX_CAPSULE_TITLE_CHARS) }),
    );
    const rejected = newCapsuleSchema.safeParse(
      input({ title: "a".repeat(MAX_CAPSULE_TITLE_CHARS + 1) }),
    );

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it("rejeita data no passado", () => {
    // TEST-UI-04
    const result = newCapsuleSchema.safeParse(input({ revealDate: pastLocal() }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/futuro/i);
    }
  });

  it("aceita data futura e título vazio", () => {
    const result = newCapsuleSchema.safeParse(input({ title: "   " }));

    expect(result.success).toBe(true);
  });

  it("rejeita corpo vazio ou só com espaços", () => {
    expect(newCapsuleSchema.safeParse(input({ content: "" })).success).toBe(false);
    expect(newCapsuleSchema.safeParse(input({ content: "   \n  " })).success).toBe(false);
  });
});
