/** Card de cápsula selada, com badge, data e contagem regressiva. */

import Countdown from "./Countdown";
import { formatDateTimePtBr } from "../lib/dates";
import type { CapsuleSummary } from "../lib/types";

interface CapsuleCardProps {
  capsule: CapsuleSummary;
  onDelete: (capsule: CapsuleSummary) => void;
}

export default function CapsuleCard({ capsule, onDelete }: CapsuleCardProps) {
  const title = capsule.title ?? "Sem título";

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface/80 p-5 transition hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Criada em {formatDateTimePtBr(capsule.createdAt)}
          </p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-strong">
          <span aria-hidden="true">🔒</span>
          Lacrada
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border-subtle pt-4">
        <div className="space-y-1">
          <p className="text-xs text-ink-muted">Abre em {formatDateTimePtBr(capsule.revealDate)}</p>
          <Countdown target={capsule.revealDate} />
        </div>

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
