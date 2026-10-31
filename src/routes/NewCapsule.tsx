/**
 * Criação de cápsula (`/nova`).
 *
 * A data é escolhida em hora local, convertida para UTC no envio e exibida
 * novamente em ambos os fusos antes de selar (`UI-15`, `UI-16`).
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { createCapsule } from "../lib/api";
import {
  datetimeLocalToUtc,
  formatDateTimePtBr,
  nowDatetimeLocal,
  utcToDatetimeLocal,
} from "../lib/dates";
import { errorMessage, toAppError } from "../lib/errors";
import {
  MAX_CAPSULE_CONTENT_BYTES,
  MAX_CAPSULE_TITLE_CHARS,
  newCapsuleSchema,
  type NewCapsuleFormValues,
} from "../lib/schemas";
import { textByteLength, textCharLength } from "../lib/text";
import type { CreateCapsuleInput } from "../lib/types";

const TOAST_MESSAGE = "Cápsula selada com sucesso.";

const BYTE_FORMATTER = new Intl.NumberFormat("pt-BR");

export default function NewCapsule() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [minRevealDate] = useState(nowDatetimeLocal);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewCapsuleFormValues>({
    resolver: zodResolver(newCapsuleSchema),
    defaultValues: { title: "", content: "", revealDate: "" },
    mode: "onBlur",
  });

  const title = useWatch({ control, name: "title" }) ?? "";
  const content = useWatch({ control, name: "content" }) ?? "";
  const revealDate = useWatch({ control, name: "revealDate" }) ?? "";

  const titleChars = textCharLength(title.trim());
  const contentBytes = textByteLength(content);
  const previewIso = datetimeLocalToUtc(revealDate);

  const create = useMutation({
    mutationFn: (input: CreateCapsuleInput) => createCapsule(input),
  });

  async function onSubmit(values: NewCapsuleFormValues) {
    setServerError(null);

    const revealDateUtc = datetimeLocalToUtc(values.revealDate);

    if (!revealDateUtc) {
      setError("revealDate", { type: "manual", message: "Informe uma data válida." });
      return;
    }

    try {
      await create.mutateAsync({
        title: values.title.trim() === "" ? null : values.title.trim(),
        content: values.content,
        revealDate: revealDateUtc,
      });

      await queryClient.invalidateQueries({ queryKey: ["capsules"] });
      navigate("/", { replace: true, state: { toast: TOAST_MESSAGE } });
    } catch (error) {
      const appError = toAppError(error);
      const message = errorMessage(appError);

      if (
        appError.code === "INVALID_INPUT" &&
        (appError.field === "title" ||
          appError.field === "content" ||
          appError.field === "revealDate")
      ) {
        setError(appError.field, { type: "server", message });
        return;
      }

      setServerError(message);
    }
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Nova Cápsula</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Escreva agora. A mensagem fica cifrada até a data escolhida.
        </p>
      </div>

      {serverError ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {serverError}
        </p>
      ) : null}

      <form
        className="mt-8 space-y-6 rounded-3xl border border-border-subtle bg-surface/70 p-6 sm:p-8"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="capsule-title" className="text-sm font-medium text-ink">
              Título <span className="font-normal text-ink-muted">(opcional)</span>
            </label>
            <span className="text-xs tabular-nums text-ink-muted">
              {titleChars}/{MAX_CAPSULE_TITLE_CHARS}
            </span>
          </div>

          <input
            id="capsule-title"
            type="text"
            placeholder="Para o meu eu de 2030"
            className="w-full rounded-xl border border-border-strong bg-canvas/70 px-4 py-3 text-sm text-ink transition placeholder:text-ink-muted focus:border-accent"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "capsule-title-error" : undefined}
            {...register("title")}
          />

          {errors.title ? (
            <p id="capsule-title-error" className="text-sm text-rose-300">
              {errors.title.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="capsule-content" className="text-sm font-medium text-ink">
              Sua mensagem
            </label>
            <span className="text-xs tabular-nums text-ink-muted">
              {BYTE_FORMATTER.format(contentBytes)}/
              {BYTE_FORMATTER.format(MAX_CAPSULE_CONTENT_BYTES)} bytes
            </span>
          </div>

          <textarea
            id="capsule-content"
            rows={10}
            placeholder="Querido eu do futuro…"
            className="w-full resize-y rounded-xl border border-border-strong bg-canvas/70 px-4 py-3 text-sm leading-relaxed text-ink transition placeholder:text-ink-muted focus:border-accent"
            aria-invalid={errors.content ? true : undefined}
            aria-describedby={errors.content ? "capsule-content-error" : undefined}
            {...register("content")}
          />

          {errors.content ? (
            <p id="capsule-content-error" className="text-sm text-rose-300">
              {errors.content.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="capsule-reveal-date" className="block text-sm font-medium text-ink">
            Data de revelação
          </label>

          <input
            id="capsule-reveal-date"
            type="datetime-local"
            min={minRevealDate}
            className="w-full rounded-xl border border-border-strong bg-canvas/70 px-4 py-3 text-sm text-ink transition focus:border-accent"
            aria-invalid={errors.revealDate ? true : undefined}
            aria-describedby={
              errors.revealDate
                ? "capsule-reveal-date-error capsule-reveal-preview"
                : "capsule-reveal-preview"
            }
            {...register("revealDate")}
          />

          {errors.revealDate ? (
            <p id="capsule-reveal-date-error" className="text-sm text-rose-300">
              {errors.revealDate.message}
            </p>
          ) : null}

          <div
            id="capsule-reveal-preview"
            className="rounded-xl border border-border-subtle/70 bg-canvas/40 px-4 py-3"
          >
            {previewIso ? (
              <p className="text-xs leading-relaxed text-ink-muted">
                Será revelada em{" "}
                <strong className="font-medium text-ink">{formatDateTimePtBr(previewIso)}</strong>{" "}
                (horário local).
                <br />
                Em UTC: <code className="text-ink-muted">{previewIso}</code>
              </p>
            ) : (
              <p className="text-xs text-ink-muted">
                Escolha a data em que a cápsula poderá ser aberta. O horário é o do seu computador.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-6">
          <Link
            to="/"
            className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:border-accent/50 hover:text-ink"
          >
            Cancelar
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-canvas transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Selando…" : "Selar cápsula"}
          </button>
        </div>
      </form>

      {revealDate && previewIso ? (
        <p className="mt-4 text-center text-xs text-ink-muted">
          Você poderá abrir esta cápsula a partir de{" "}
          {utcToDatetimeLocal(previewIso).replace("T", " às ")}.
        </p>
      ) : null}
    </section>
  );
}
