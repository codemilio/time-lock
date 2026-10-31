/**
 * Setup do primeiro uso (`/setup`).
 *
 * Exige senha + confirmação, score zxcvbn >= 3 e o aceite explícito de que
 * não há recuperação de senha (`AUTH-04`, `AUTH-07`, `AUTH-AC-03`).
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import PasswordStrength from "../components/PasswordStrength";
import { setupMasterPassword } from "../lib/api";
import { errorMessage, toAppError } from "../lib/errors";
import {
  evaluatePassword,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_CHARS,
  MIN_PASSWORD_SCORE,
  passwordByteLength,
  passwordCharLength,
} from "../lib/password";
import { requestNotificationPermission } from "../lib/notifications";
import { queryKeys } from "../lib/query";

const PASSWORD_WARNING =
  "Sua senha mestra não pode ser recuperada. Se você esquecê-la, todas as cápsulas serão permanentemente inacessíveis.";

const setupSchema = z
  .object({
    password: z.string().superRefine((value, ctx) => {
      if (passwordCharLength(value) < MIN_PASSWORD_CHARS) {
        ctx.addIssue({
          code: "custom",
          message: `A senha deve ter pelo menos ${MIN_PASSWORD_CHARS} caracteres.`,
        });
        return;
      }

      if (passwordByteLength(value) > MAX_PASSWORD_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `A senha deve ter no máximo ${MAX_PASSWORD_BYTES} bytes.`,
        });
        return;
      }

      if (evaluatePassword(value).score < MIN_PASSWORD_SCORE) {
        ctx.addIssue({
          code: "custom",
          message: "Senha muito previsível. Use uma frase longa e fácil de lembrar.",
        });
      }
    }),
    confirm: z.string().min(1, "Confirme a senha."),
    acknowledged: z.boolean().refine((value) => value, {
      message: "Marque a caixa para confirmar que entende o aviso.",
    }),
  })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

type SetupFormValues = z.infer<typeof setupSchema>;

export default function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { password: "", confirm: "", acknowledged: false },
    mode: "onBlur",
  });

  const password = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(values: SetupFormValues) {
    setServerError(null);

    try {
      await setupMasterPassword(values.password);

      // Permissão é solicitada só depois do setup concluído (`NOTIF-04`).
      void requestNotificationPermission();

      await queryClient.invalidateQueries({ queryKey: queryKeys.appState });
      navigate("/", { replace: true });
    } catch (error) {
      const appError = toAppError(error);
      const message = errorMessage(appError);

      if (appError.code === "INVALID_INPUT" && appError.field === "password") {
        setError("password", { type: "server", message });
        return;
      }

      setServerError(message);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(240,180,90,0.18),transparent_55%)]"
      />

      <section className="relative w-full max-w-xl rounded-3xl border border-border-subtle bg-surface/90 p-8 shadow-2xl shadow-black/40 backdrop-blur sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Primeiro uso</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          Crie sua senha mestra
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Ela protege todas as suas cápsulas. Você vai usá-la sempre que abrir o aplicativo.
        </p>

        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <p className="flex gap-2 text-sm leading-relaxed text-accent-strong">
            <span aria-hidden="true">⚠️</span>
            <span>{PASSWORD_WARNING}</span>
          </p>
        </div>

        {serverError ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {serverError}
          </p>
        ) : null}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-2">
            <label htmlFor="setup-password" className="block text-sm font-medium text-ink">
              Senha mestra
            </label>
            <input
              id="setup-password"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full rounded-xl border border-border-strong bg-canvas/70 px-4 py-3 text-sm text-ink transition placeholder:text-ink-muted focus:border-accent"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password ? "setup-password-hint setup-password-error" : "setup-password-hint"
              }
              {...register("password")}
            />

            <div id="setup-password-hint">
              <PasswordStrength password={password} />
            </div>

            {errors.password ? (
              <p id="setup-password-error" className="text-sm text-rose-300">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="setup-confirm" className="block text-sm font-medium text-ink">
              Confirme a senha
            </label>
            <input
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full rounded-xl border border-border-strong bg-canvas/70 px-4 py-3 text-sm text-ink transition placeholder:text-ink-muted focus:border-accent"
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={errors.confirm ? "setup-confirm-error" : undefined}
              {...register("confirm")}
            />

            {errors.confirm ? (
              <p id="setup-confirm-error" className="text-sm text-rose-300">
                {errors.confirm.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="setup-acknowledged" className="flex items-start gap-3 text-sm text-ink">
              <input
                id="setup-acknowledged"
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-canvas accent-accent"
                aria-invalid={errors.acknowledged ? true : undefined}
                aria-describedby={errors.acknowledged ? "setup-acknowledged-error" : undefined}
                {...register("acknowledged")}
              />
              <span>Entendo que não há recuperação de senha.</span>
            </label>

            {errors.acknowledged ? (
              <p id="setup-acknowledged-error" className="text-sm text-rose-300">
                {errors.acknowledged.message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Criando sua senha…" : "Criar senha mestra"}
          </button>
        </form>
      </section>
    </main>
  );
}
