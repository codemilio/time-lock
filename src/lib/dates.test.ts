import { describe, expect, it } from "vitest";

import { datetimeLocalToUtc, formatDateTimePtBr, isPastDate, utcToDatetimeLocal } from "./dates";

describe("dates", () => {
  it("converte datetime-local para RFC3339 UTC", () => {
    // TEST-UI-03
    const iso = datetimeLocalToUtc("2026-03-15T14:30");

    expect(iso).toBe(new Date(2026, 2, 15, 14, 30, 0, 0).toISOString());
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("aceita segundos opcionais", () => {
    const iso = datetimeLocalToUtc("2026-03-15T14:30:45");

    expect(iso).toBe(new Date(2026, 2, 15, 14, 30, 45, 0).toISOString());
  });

  it("rejeita datas inexistentes e formatos inválidos", () => {
    expect(datetimeLocalToUtc("2026-02-31T10:00")).toBeNull();
    expect(datetimeLocalToUtc("2026-13-01T10:00")).toBeNull();
    expect(datetimeLocalToUtc("15/03/2026 14:30")).toBeNull();
    expect(datetimeLocalToUtc("")).toBeNull();
  });

  it("faz o caminho de ida e volta em datetime-local", () => {
    const iso = new Date(2026, 10, 2, 8, 5, 0, 0).toISOString();

    expect(utcToDatetimeLocal(iso)).toBe("2026-11-02T08:05");
  });

  it("formata datas em pt-BR", () => {
    const iso = new Date(2026, 2, 15, 14, 30, 0, 0).toISOString();
    const expected = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));

    expect(formatDateTimePtBr(iso)).toBe(expected);
    expect(formatDateTimePtBr("valor inválido")).toBe("Data indisponível");
    expect(formatDateTimePtBr(null)).toBe("");
  });

  it("identifica datas passadas", () => {
    const now = new Date(2026, 2, 15, 12, 0, 0, 0);

    expect(isPastDate(new Date(2026, 2, 15, 11, 59).toISOString(), now)).toBe(true);
    expect(isPastDate(new Date(2026, 2, 15, 12, 0).toISOString(), now)).toBe(true);
    expect(isPastDate(new Date(2026, 2, 15, 12, 1).toISOString(), now)).toBe(false);
  });
});
