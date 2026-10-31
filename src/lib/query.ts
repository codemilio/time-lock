/**
 * Chaves de query e configuração do React Query.
 *
 * O cache é apenas em memória (`UI-12`); não há persistência de conteúdo.
 */

import { QueryClient } from "@tanstack/react-query";
import type { CapsuleStatus } from "./types";

export const queryKeys = {
  appState: ["app-state"] as const,
  capsules: (status: CapsuleStatus | "all") => ["capsules", status] as const,
  capsule: (id: string) => ["capsule", id] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
