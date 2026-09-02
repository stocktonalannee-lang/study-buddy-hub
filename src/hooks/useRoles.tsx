import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "verified_sharer";

/** Roles for the signed-in user. Roles are stored server-side and enforced by RLS. */
export function useRoles() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["roles", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => row.role as AppRole);
    },
  });

  const roles = query.data ?? [];
  return {
    roles,
    isLoading: query.isLoading,
    isAdmin: roles.includes("admin"),
    isVerifiedSharer: roles.includes("verified_sharer") || roles.includes("admin"),
  };
}
