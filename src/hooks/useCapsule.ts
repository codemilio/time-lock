/**
 * Consulta de uma cápsula para leitura (`UI-03`, `UI-12`).
 *
 * O conteúdo é buscado sob demanda e nunca fica em cache persistente. O
 * detalhe também remove a query ao desmontar, mas `gcTime: 0` garante a
 * limpeza mesmo se o componente for desmontado por um redirecionamento.
 */

import { useQuery } from "@tanstack/react-query";

import { readCapsule } from "../lib/api";
import { AppError } from "../lib/errors";
import { queryKeys } from "../lib/query";
import type { CapsuleContent } from "../lib/types";

export function useCapsule(id: string | undefined) {
  return useQuery<CapsuleContent>({
    queryKey: queryKeys.capsule(id ?? ""),
    queryFn: () => {
      if (!id) {
        throw new AppError("CAPSULE_NOT_FOUND");
      }

      return readCapsule(id);
    },
    enabled: Boolean(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}
