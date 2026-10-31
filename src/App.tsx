/**
 * Rotas e guards de boot (`UI-05` a `UI-08`).
 *
 * O guard de boot consulta `get_app_state` antes de renderizar qualquer rota.
 * Enquanto o setup não termina, tudo leva a `/setup`; com setup concluído e
 * sessão bloqueada, rotas protegidas levam a `/login`.
 */

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { useAppState } from "./hooks/useAppState";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { errorMessage } from "./lib/errors";
import { createQueryClient } from "./lib/query";
import type { AppState } from "./lib/types";
import ArchivedList from "./routes/ArchivedList";
import CapsuleDetail from "./routes/CapsuleDetail";
import Login from "./routes/Login";
import NewCapsule from "./routes/NewCapsule";
import RevealedList from "./routes/RevealedList";
import SealedHome from "./routes/SealedHome";
import Setup from "./routes/Setup";

function BootScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 animate-pulse items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-2xl"
        >
          ⏳
        </span>
        <p className="text-sm text-ink-muted">Carregando suas cápsulas…</p>
      </div>
    </main>
  );
}

interface BootErrorProps {
  error: unknown;
  onRetry: () => void;
}

function BootError({ error, onRetry }: BootErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-md rounded-3xl border border-border-subtle bg-surface/90 p-8 text-center shadow-2xl shadow-black/40">
        <h1 className="text-xl font-semibold text-ink">Não foi possível iniciar</h1>
        <p role="alert" aria-live="polite" className="mt-3 text-sm text-ink-muted">
          {errorMessage(error)}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition hover:bg-accent-strong"
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}

interface ProtectedRouteProps {
  state: AppState;
  children: ReactNode;
}

function ProtectedRoute({ state, children }: ProtectedRouteProps) {
  if (!state.setupCompleted) {
    return <Navigate to="/setup" replace />;
  }

  if (!state.unlocked) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function fallbackPath(state: AppState): string {
  if (!state.setupCompleted) {
    return "/setup";
  }

  return state.unlocked ? "/" : "/login";
}

function AppShell() {
  const appStateQuery = useAppState();
  const { refetch } = appStateQuery;
  const { revealedCount, dismissRevealed } = useTauriEvents();

  if (appStateQuery.isPending) {
    return <BootScreen />;
  }

  if (appStateQuery.isError) {
    return <BootError error={appStateQuery.error} onRetry={() => void refetch()} />;
  }

  const state = appStateQuery.data;

  if (!state) {
    return <BootError error={null} onRetry={() => void refetch()} />;
  }

  return (
    <Routes>
      <Route
        path="/setup"
        element={state.setupCompleted ? <Navigate to={fallbackPath(state)} replace /> : <Setup />}
      />

      <Route
        path="/login"
        element={
          state.setupCompleted ? (
            state.unlocked ? (
              <Navigate to="/" replace />
            ) : (
              <Login />
            )
          ) : (
            <Navigate to="/setup" replace />
          )
        }
      />

      <Route
        element={
          <ProtectedRoute state={state}>
            <Layout revealedCount={revealedCount} onDismissRevealed={dismissRevealed} />
          </ProtectedRoute>
        }
      >
        <Route index element={<SealedHome />} />
        <Route path="/nova" element={<NewCapsule />} />
        <Route path="/reveladas" element={<RevealedList />} />
        <Route path="/arquivadas" element={<ArchivedList />} />
        <Route path="/capsula/:id" element={<CapsuleDetail />} />
      </Route>

      <Route path="*" element={<Navigate to={fallbackPath(state)} replace />} />
    </Routes>
  );
}

export default function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
