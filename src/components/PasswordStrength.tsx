/**
 * Medidor de força da senha com feedback do zxcvbn em PT-BR.
 */

import { useMemo } from "react";

import { evaluatePassword, MIN_PASSWORD_SCORE } from "../lib/password";

interface PasswordStrengthProps {
  password: string;
}

const LEVELS = [
  { label: "Muito fraca", bar: "bg-rose-500", text: "text-rose-300" },
  { label: "Fraca", bar: "bg-orange-500", text: "text-orange-300" },
  { label: "Razoável", bar: "bg-amber-400", text: "text-amber-200" },
  { label: "Forte", bar: "bg-emerald-500", text: "text-emerald-300" },
  { label: "Excelente", bar: "bg-emerald-400", text: "text-emerald-200" },
] as const;

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = useMemo(() => evaluatePassword(password), [password]);

  if (!password) {
    return (
      <p className="text-xs text-ink-muted">
        Use pelo menos 12 caracteres. Uma frase longa e fácil de lembrar é mais segura.
      </p>
    );
  }

  const level = LEVELS[strength.score] ?? LEVELS[0];
  const feedback = strength.warning ?? strength.suggestions[0] ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex flex-1 gap-1.5"
          role="meter"
          aria-label="Força da senha"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={strength.score}
        >
          {LEVELS.map((entry, index) => (
            <span
              key={entry.label}
              aria-hidden="true"
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index <= strength.score ? level.bar : "bg-border-subtle"
              }`}
            />
          ))}
        </div>

        <span className={`text-xs font-medium ${level.text}`}>{level.label}</span>
      </div>

      {strength.score < MIN_PASSWORD_SCORE && feedback ? (
        <p className="text-xs text-ink-muted">{feedback}</p>
      ) : null}
    </div>
  );
}
