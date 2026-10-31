/**
 * Home de cápsulas seladas (`/`).
 *
 * Lista, estados de carregando/vazio/erro e exclusão com confirmação.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";

import CapsuleCard from "../components/CapsuleCard";
import ConfirmDialog from "../components/ConfirmDialog";
import { useCapsules } from "../hooks/useCapsules";
import { deleteCapsule } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { DELETE_CONFIRMATION_TEXT } from "../lib/messages";
import type { CapsuleSummary } from "../lib/types";

const TOAST_MESSAGE = "Cápsula selada com sucesso.";

function readToast(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "toast" in state) {
    const value = (state as { toast?: unknown }).toast;
    return typeof value === "string" ? value : null;
  }

  return null;
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Seladas</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Mensagens que ainda estão guardadas, esperando a data certa para chegar.
        </p>
      </div>

      <Link
        to="/nova"
        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-accent-strong"
      >
        Nova Cápsula
      </Link>
    </div>
  );
}

export default function SealedHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useCapsules("sealed");
  const [toast, setToast] = useState(() => readToast(location.state));
  const [selected, setSelected] = useState<CapsuleSummary | null>(null);

  useEffect(() => {
    if (readToast(location.state)) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

  if (query.isPending) {
    return (
      <section aria-busy="true">
        <PageHeader />
        <p role="status" className="sr-only">
          Carregando cápsulas…
        </p>
        <div aria-hidden="true" className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl border border-border-subtle bg-surface/60"
            />
          ))}
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section>
        <PageHeader />
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
      <PageHeader />

      {toast ? (
        <div
          role="status"
          className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
        >
          <span>✅ {TOAST_MESSAGE}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs font-medium text-emerald-200 underline-offset-2 hover:underline"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {capsules.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-border-subtle bg-surface/40 px-6 py-14 text-center">
          <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-muted">
            Nenhuma cápsula selada. Escreva a primeira mensagem para o seu eu do futuro.
          </p>
          <Link
            to="/nova"
            className="mt-6 inline-block rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition hover:bg-accent-strong"
          >
            Nova Cápsula
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {capsules.map((capsule) => (
            <li key={capsule.id}>
              <CapsuleCard capsule={capsule} onDelete={setSelected} />
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
