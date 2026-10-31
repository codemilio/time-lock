/** Consulta de cápsulas por status (`UI-10`). */

import { useQuery } from "@tanstack/react-query";

import { listCapsules } from "../lib/api";
import { queryKeys } from "../lib/query";
import type { CapsuleStatus } from "../lib/types";

export function useCapsules(status: CapsuleStatus | "all") {
  return useQuery({
    queryKey: queryKeys.capsules(status),
    queryFn: () => listCapsules({ status: status === "all" ? null : status }),
  });
}
