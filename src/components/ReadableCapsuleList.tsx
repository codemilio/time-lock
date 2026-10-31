/**
 * Lista compartilhada de cápsulas reveladas e arquivadas.
 *
 * Trata carregando, vazio, erro e sucesso (`UI-AC-03`) e concentra as ações
 * de arquivar e excluir, invalidando as listas após cada mutação.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCapsules } from "../hooks/useCapsules";
import { archiveCapsule, deleteCapsule } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { DELETE_CONFIRMATION_TEXT } from "../lib/messages";
import type { CapsuleStatus, CapsuleSummary } from "../lib/types";
import ConfirmDialog from "./ConfirmDialog";
import ReadableCapsuleCard from "./ReadableCapsuleCard";

type ReadableStatus = Extract<CapsuleStatus, "revealed" | "archived">;

interface ReadableCapsuleListProps {
  status: ReadableStatus;
  title: string;
  description: string;
  emptyMessage: string;
}

export default function ReadableCapsuleList({
  status,
  title,
  description,
  emptyMessage,
}: ReadableCapsuleListProps) {
  const queryClient = useQueryClient();
  const query = useCapsules(status);
  const [selected, setSelected] = useState<CapsuleSummary | null>(null);

  const archive = useMutation({
    mutationFn: (id: string) => archiveCapsule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["capsules"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCapsule(id),
    onSuccess: () => {
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["capsules"] });
    },
  });

  function closeDialog() {
    remove.reset();
    setSelected(null);
  }

  function renderHeader() {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <section aria-busy="true">
        {renderHeader()}
        <p role="status" className="sr-only">
          Carregando cápsulas…
        </p>
        <div aria-hidden="true" className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-border-subtle bg-surface/60"
            />
          ))}
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section>
        {renderHeader()}
        <div
          role="alert"
          aria-live="polite"
          className="mt-8 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6"
        >
          <p className="text-sm text-rose-200">{errorMessage(query.error)}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 rounded-xl border border-rose-400/40 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  const capsules = query.data;

  return (
    <section>
      {renderHeader()}

      {archive.isError ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {errorMessage(archive.error)}
        </p>
      ) : null}

      {capsules.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-border-subtle bg-surface/40 px-6 py-14 text-center">
          <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-muted">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {capsules.map((capsule) => (
            <li key={capsule.id}>
              <ReadableCapsuleCard
                capsule={capsule}
                onArchive={(id) => archive.mutate(id)}
                archivePending={archive.isPending && archive.variables === capsule.id}
                onDelete={setSelected}
              />
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <ConfirmDialog
          title="Excluir cápsula?"
          description={DELETE_CONFIRMATION_TEXT}
          confirmLabel="Excluir"
          pending={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onCancel={closeDialog}
          onConfirm={() => remove.mutate(selected.id)}
        />
      ) : null}
    </section>
  );
}
