/**
 * Detalhe e leitura de uma cápsula (`/capsula/:id`).
 *
 * O conteúdo é buscado sob demanda, exibido como texto puro (`UI-04`) e
 * removido do cache ao desmontar (`UI-03`). Arquivar e excluir ficam
 * disponíveis conforme o status.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import ConfirmDialog from "../components/ConfirmDialog";
import { useCapsule } from "../hooks/useCapsule";
import { archiveCapsule, deleteCapsule } from "../lib/api";
import { formatDateTimePtBr } from "../lib/dates";
import { errorMessage, toAppError } from "../lib/errors";
import { DELETE_CONFIRMATION_TEXT } from "../lib/messages";
import { queryKeys } from "../lib/query";
import type { CapsuleContent } from "../lib/types";

export default function CapsuleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useCapsule(id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    return () => {
      queryClient.removeQueries({ queryKey: queryKeys.capsule(id), exact: true });
    };
  }, [id, queryClient]);

  const archived = query.data?.status === "archived";
  const backPath = archived ? "/arquivadas" : "/reveladas";
  const backLabel = archived ? "Voltar para arquivadas" : "Voltar para reveladas";

  const archive = useMutation({
    mutationFn: () => archiveCapsule(id ?? ""),
    onSuccess: (summary) => {
      if (!id) {
        return;
      }

      queryClient.setQueryData<CapsuleContent>(queryKeys.capsule(id), (current) =>
        current ? { ...current, ...summary } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["capsules"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteCapsule(id ?? ""),
    onSuccess: () => {
      if (id) {
        queryClient.removeQueries({ queryKey: queryKeys.capsule(id), exact: true });
      }

      void queryClient.invalidateQueries({ queryKey: ["capsules"] });
      navigate(backPath, { replace: true });
    },
  });

  function closeDialog() {
    remove.reset();
    setConfirmOpen(false);
  }

  if (query.isPending) {
    return (
      <section aria-busy="true">
        <p role="status" className="sr-only">
          Abrindo cápsula…
        </p>
        <div aria-hidden="true" className="space-y-4">
          <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
          <div className="h-9 w-2/3 animate-pulse rounded bg-surface-raised" />
          <div className="h-48 animate-pulse rounded-3xl border border-border-subtle bg-surface/60" />
        </div>
      </section>
    );
  }

  if (query.isError || !query.data) {
    const appError = toAppError(query.error);
    const notFound = appError.code === "CAPSULE_NOT_FOUND";

    return (
      <section className="mx-auto max-w-2xl">
        <Link to="/reveladas" className="text-sm text-ink-muted transition hover:text-ink">
          ← Voltar
        </Link>

        <div
          role="alert"
          aria-live="polite"
          className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6"
        >
          <h1 className="text-lg font-semibold text-rose-100">
            {notFound ? "Cápsula não encontrada" : "Não foi possível abrir a cápsula"}
          </h1>
          <p className="mt-2 text-sm text-rose-200">{errorMessage(query.error)}</p>

          {!notFound ? (
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-4 rounded-xl border border-rose-400/40 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const capsule = query.data;
  const title = capsule.title ?? "Sem título";
  const revealDate = capsule.revealedAt ?? capsule.revealDate;

  return (
    <section className="mx-auto max-w-3xl">
      <Link
        to={backPath}
        className="inline-flex items-center gap-2 text-sm text-ink-muted transition hover:text-ink"
      >
        ← {backLabel}
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              archived
                ? "border-border-subtle bg-surface-raised text-ink-muted"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            <span aria-hidden="true">{archived ? "📦" : "✨"}</span>
            {archived ? "Arquivada" : "Revelada"}
          </span>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-muted">
          <div>
            <dt className="sr-only">Revelada em</dt>
            <dd>Revelada em {formatDateTimePtBr(revealDate)}</dd>
          </div>

          {capsule.archivedAt ? (
            <div>
              <dt className="sr-only">Arquivada em</dt>
              <dd>Arquivada em {formatDateTimePtBr(capsule.archivedAt)}</dd>
            </div>
          ) : null}

          <div>
            <dt className="sr-only">Criada em</dt>
            <dd>Criada em {formatDateTimePtBr(capsule.createdAt)}</dd>
          </div>
        </dl>
      </header>

      <article className="mt-8 rounded-3xl border border-border-subtle bg-surface/80 p-6 sm:p-8">
        <h2 className="sr-only">Conteúdo da cápsula</h2>
        {/* Texto puro: o React escapa HTML e o CSS preserva as quebras de linha. */}
        <p
          data-testid="capsule-content"
          className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink"
        >
          {capsule.content}
        </p>
      </article>

      {archive.isError ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {errorMessage(archive.error)}
        </p>
      ) : null}

      {archive.isSuccess ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
        >
          Cápsula arquivada.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-6">
        {capsule.status === "revealed" ? (
          <button
            type="button"
            onClick={() => archive.mutate()}
            disabled={archive.isPending}
            className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {archive.isPending ? "Arquivando…" : "Arquivar"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            remove.reset();
            setConfirmOpen(true);
          }}
          className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400"
        >
          Excluir
        </button>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          title="Excluir cápsula?"
          description={DELETE_CONFIRMATION_TEXT}
          confirmLabel="Excluir"
          pending={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onCancel={closeDialog}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </section>
  );
}
