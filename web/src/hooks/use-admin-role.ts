import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

export type AdminRole = "founder" | "admin";

/** The signed-in account's admin role, checked server-side against the admin roster. */
export function useAdminRole() {
  const { user, isReady } = useAuth();
  const query = useQuery({
    queryKey: ["admin-role", user?.id ?? "anon"],
    queryFn: async (): Promise<AdminRole | null> => {
      const { data, error } = await supabase.rpc("my_admin_role");
      if (error) throw error;
      return data === "founder" || data === "admin" ? data : null;
    },
    enabled: isReady && Boolean(user),
    staleTime: 60_000,
    retry: 1,
  });
  const role = query.data ?? null;
  return {
    role,
    isAdmin: role !== null,
    isFounder: role === "founder",
    isLoading: !isReady || (Boolean(user) && query.isPending),
    isError: query.isError,
  };
}
