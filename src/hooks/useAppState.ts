/**
 * Estado global exposto por `get_app_state`.
 *
 * É a fonte dos guards de boot, setup e login (`UI-05`, `UI-06`, `UI-07`).
 */

import { useQuery } from "@tanstack/react-query";

import { getAppState } from "../lib/api";
import { queryKeys } from "../lib/query";
import type { AppState } from "../lib/types";

export function useAppState() {
  return useQuery<AppState>({
    queryKey: queryKeys.appState,
    queryFn: getAppState,
    retry: false,
  });
}
