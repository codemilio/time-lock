/**
 * Login (`/login`).
 *
 * A senha não sofre trim (`AUTH-05`), o campo é limpo após erro e o backoff
 * do backend é exibido como contagem regressiva (`AUTH-10`, `AUTH-AC-04`).
 */

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { unlock } from "../lib/api";
import { retryDeadline } from "../lib/dates";
import { errorMessage, toAppError } from "../lib/errors";
import { queryKeys } from "../lib/query";

const loginSchema = z.object({
  password: z.string().min(1, "Informe sua senha."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "" },
  });

  useEffect(() => {
    if (retryUntil === null) {
      return;
    }

    const tick = () => {
      const left = retryUntil - Date.now();

      if (left <= 0) {
        setRetryUntil(null);
        setRemainingSeconds(0);
        setServerError(null);
        return;
      }

      setRemainingSeconds(Math.ceil(left / 1000));
    };

    tick();
    const interval = window.setInterval(tick, 250);

    return () => window.clearInterval(interval);
  }, [retryUntil]);

  const blocked = retryUntil !== null;
  const message = blocked
    ? `Muitas tentativas. Aguarde ${remainingSeconds}s para tentar novamente.`
    : serverError;

  async function onSubmit(values: LoginFormValues) {
    if (blocked) {
      return;
    }

    setServerError(null);

    try {
      await unlock(values.password);
      await queryClient.invalidateQueries({ queryKey: queryKeys.appState });
      navigate("/", { replace: true });
    } catch (error) {
      const appError = toAppError(error);

      if (appError.code === "INVALID_PASSWORD") {
        resetField("password");
        setFocus("password");
        setServerError(errorMessage(appError));
        return;
      }

      if (appError.code === "RATE_LIMITED") {
        const milliseconds = appError.retryAfterMs ?? 1_000;
        resetField("password");
        setFocus("password");
        setRemainingSeconds(Math.max(1, Math.ceil(milliseconds / 1_000)));
        setRetryUntil(retryDeadline(milliseconds));
        return;
      }

      setServerError(errorMessage(appError));
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(240,180,90,0.16),transparent_55%)]"
      />

      <section className="relative w-full max-w-md rounded-3xl border border-border-subtle bg-surface/90 p-8 shadow-2xl shadow-black/40 backdrop-blur sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Cápsula do Tempo
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Bem-vindo de volta</h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Digite sua senha mestra para abrir suas cápsulas.
        </p>

        {message ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {message}
          </p>
        ) : null}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-2">
            <label htmlFor="login-password" className="block text-sm font-medium text-ink">
              Senha mestra
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full rounded-xl border border-border-strong bg-canvas/70 px-4 py-3 text-sm text-ink transition placeholder:text-ink-muted focus:border-accent"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              {...register("password")}
            />

            {errors.password ? (
              <p id="login-password-error" className="text-sm text-rose-300">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || blocked}
            className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Verificando…" : "Desbloquear"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">
          Sua senha mestra não pode ser recuperada.
        </p>
      </section>
    </main>
  );
}
