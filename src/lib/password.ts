/**
 * Regras de senha mestra e avaliação com zxcvbn (dicionário PT-BR).
 */

import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnPtBr from "@zxcvbn-ts/language-pt-br";

import { textByteLength, textCharLength } from "./text";

/** Mínimo de caracteres Unicode (`AUTH-01`). */
export const MIN_PASSWORD_CHARS = 12;

/** Máximo de bytes UTF-8 (`AUTH-01`). */
export const MAX_PASSWORD_BYTES = 1024;

/** Score mínimo aceito no setup (`AUTH-02`, `AUTH-04`). */
export const MIN_PASSWORD_SCORE = 3;

const zxcvbn = new ZxcvbnFactory({
  translations: zxcvbnPtBr.translations,
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnPtBr.dictionary,
  },
});

export interface PasswordStrength {
  /** Escala 0-4. */
  score: number;
  warning: string | null;
  suggestions: string[];
}

/** Conta caracteres Unicode, não unidades UTF-16. */
export function passwordCharLength(value: string): number {
  return textCharLength(value);
}

/** Conta bytes UTF-8. */
export function passwordByteLength(value: string): number {
  return textByteLength(value);
}

/** Avalia a força da senha. Senha vazia tem score 0. */
export function evaluatePassword(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, warning: null, suggestions: [] };
  }

  const result = zxcvbn.check(password);

  return {
    score: result.score,
    warning: result.feedback.warning ?? null,
    suggestions: result.feedback.suggestions ?? [],
  };
}
