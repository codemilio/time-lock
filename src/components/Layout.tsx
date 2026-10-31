/**
 * Shell autenticado: navegação principal e ação de bloquear (`UI-19`).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import NotificationBanner from "./NotificationBanner";
import { lock } from "../lib/api";
import { errorMessage } from "../lib/errors";

const NAV_ITEMS = [
  { to: "/", label: "Seladas", end: true },
  { to: "/reveladas", label: "Reveladas", end: false },
  { to: "/arquivadas", label: "Arquivadas", end: false },
] as const;

interface LayoutProps {
  revealedCount: number;
  onDismissRevealed: () => void;
}

export default function Layout({ revealedCount, onDismissRevealed }: LayoutProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lockMutation = useMutation({
    mutationFn: () => lock(),
    onSuccess: () => {
      void queryClient.resetQueries();
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-canvas"
      >
        Pular para o conteúdo
      </a>

      <header className="border-b border-border-subtle bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-base"
            >
              ⏳
            </span>
            Cápsula do Tempo
          </Link>

          <nav aria-label="Navegação principal" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-surface-raised text-ink"
                      : "text-ink-muted hover:bg-surface-raised/60 hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/nova"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-accent-strong"
            >
              Nova Cápsula
            </Link>

            <button
              type="button"
              onClick={() => lockMutation.mutate()}
              disabled={lockMutation.isPending}
              className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lockMutation.isPending ? "Bloqueando…" : "Bloquear"}
            </button>
          </div>
        </div>

        {lockMutation.isError ? (
          <p
            role="alert"
            aria-live="polite"
            className="mx-auto w-full max-w-5xl px-6 pb-3 text-sm text-rose-300"
          >
            {errorMessage(lockMutation.error)}
          </p>
        ) : null}
      </header>

      <main
        id="conteudo-principal"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-6 py-10"
      >
        {revealedCount > 0 ? (
          <div className="mb-8">
            <NotificationBanner count={revealedCount} onDismiss={onDismissRevealed} />
          </div>
        ) : null}

        <Outlet />
      </main>
    </div>
  );
}
