/**
 * Card de cápsula revelada ou arquivada.
 *
 * O conteúdo nunca aparece aqui: a leitura acontece no detalhe, sob demanda.
 */

import { Link } from "react-router-dom";

import { formatDateTimePtBr } from "../lib/dates";
import type { CapsuleSummary } from "../lib/types";

interface ReadableCapsuleCardProps {
  capsule: CapsuleSummary;
  onArchive?: (id: string) => void;
  onDelete: (capsule: CapsuleSummary) => void;
  archivePending?: boolean;
}

export default function ReadableCapsuleCard({
  capsule,
  onArchive,
  onDelete,
  archivePending = false,
}: ReadableCapsuleCardProps) {
  const title = capsule.title ?? "Sem título";
  const archived = capsule.status === "archived";
  const date = archived
    ? (capsule.archivedAt ?? capsule.revealedAt ?? capsule.revealDate)
    : (capsule.revealedAt ?? capsule.revealDate);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface/80 p-5 transition hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">
            <Link
              to={`/capsula/${capsule.id}`}
              className="rounded transition hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {title}
            </Link>
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            {archived ? "Arquivada em" : "Revelada em"} {formatDateTimePtBr(date)}
          </p>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
            archived
              ? "border-border-subtle bg-surface-raised text-ink-muted"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          <span aria-hidden="true">{archived ? "📦" : "✨"}</span>
          {archived ? "Arquivada" : "Revelada"}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
        <Link
          to={`/capsula/${capsule.id}`}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-accent-strong"
        >
          Ler
        </Link>

        {capsule.status === "revealed" && onArchive ? (
          <button
            type="button"
            onClick={() => onArchive(capsule.id)}
            disabled={archivePending}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {archivePending ? "Arquivando…" : "Arquivar"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onDelete(capsule)}
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-rose-500/50 hover:text-rose-300"
        >
          Excluir
        </button>
      </div>
    </article>
  );
}
