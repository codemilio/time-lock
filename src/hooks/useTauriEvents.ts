/**
 * Assinatura dos eventos emitidos pelo backend.
 *
 * `auth://locked` limpa o cache do React Query (`UI-11`) e descarta o banner.
 * `capsules://revealed` invalida estado/listas (`REV-05`), acumula a contagem
 * para o banner (`UI-26`) e mantém o fallback in-app de `NOTIF-04`.
 */

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { markFrontendReady, revealDue } from "../lib/api";
import { queryKeys } from "../lib/query";
import type { RevealedEvent } from "../lib/types";

export interface TauriEventsState {
  /** Quantidade de cápsulas reveladas desde o último dismiss. */
  revealedCount: number;
  /** Fecha o banner sem afetar as listas. */
  dismissRevealed: () => void;
}

export function useTauriEvents(): TauriEventsState {
  const queryClient = useQueryClient();
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    async function checkDue() {
      try {
        await revealDue();
      } catch {
        // Sem runtime Tauri ou falha de IPC: o poll do backend continua.
      }
    }

    async function register() {
      try {
        const unlistenLocked = await listen("auth://locked", () => {
          setRevealedCount(0);
          // `resetQueries` descarta os dados e refaz as queries ativas, então
          // o guard enxerga `unlocked = false` sem depender de navegação.
          void queryClient.resetQueries();
        });

        if (disposed) {
          unlistenLocked();
          return;
        }

        unlisteners.push(unlistenLocked);

        const unlistenRevealed = await listen<RevealedEvent>("capsules://revealed", (event) => {
          const count = event.payload?.count ?? event.payload?.ids?.length ?? 0;

          if (Number.isFinite(count) && count > 0) {
            setRevealedCount((current) => current + count);
          }

          void queryClient.invalidateQueries({ queryKey: queryKeys.appState });
          void queryClient.invalidateQueries({ queryKey: ["capsules"] });
        });

        if (disposed) {
          unlistenRevealed();
          return;
        }

        unlisteners.push(unlistenRevealed);

        // Libera o primeiro tick do backend somente depois dos listeners.
        await markFrontendReady();

        if (disposed) {
          return;
        }

        // Redundância de `REV-21`; o poll de 60 s continua sendo a fonte.
        const handleFocus = () => void checkDue();
        window.addEventListener("focus", handleFocus);
        unlisteners.push(() => window.removeEventListener("focus", handleFocus));
      } catch {
        // Fora do runtime Tauri (testes/browser) não há eventos para ouvir.
      }
    }

    void register();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [queryClient]);

  const dismissRevealed = useCallback(() => setRevealedCount(0), []);

  return { revealedCount, dismissRevealed };
}
