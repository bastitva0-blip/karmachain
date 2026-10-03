"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

export function useMe() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: Me | null }>("/me").then((r) => r.user),
  });
  return {
    me: q.data ?? null,
    loading: q.isLoading,
    error: q.error,
    refresh: () => qc.invalidateQueries({ queryKey: ["me"] }),
    setMe: (u: Me | null) => qc.setQueryData(["me"], u),
  };
}
