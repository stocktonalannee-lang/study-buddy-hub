import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkAnyAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
});

export const claimFirstAdmin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error: countError } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return false;
  const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
  if (error) throw new Error(error.message);
  return true;
});

export const checkSuspended = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).from("profiles").select("suspended_at, suspension_reason").eq("id", context.userId).maybeSingle();
  if (error) throw new Error(error.message);
  return { suspended: Boolean(data?.suspended_at), reason: data?.suspension_reason ?? null };
});

export const getAdminDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: adminRole, error: roleError } = await db.from("user_roles").select("user_id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
  if (roleError) throw new Error(roleError.message);
  if (!adminRole) throw new Error("Admins only");

  const [{ data: profiles, error: profilesError }, { data: sales, error: salesError }] = await Promise.all([
    db.from("profiles").select("id, display_name, school, is_top_student, suspended_at, suspension_reason, created_at").order("created_at", { ascending: false }).limit(500),
    db.from("sales").select("id, seller_id, amount_cents, sold_at").order("sold_at", { ascending: false }),
  ]);
  if (profilesError) throw new Error(profilesError.message);
  if (salesError) throw new Error(salesError.message);

  const now = new Date();
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const earnings = new Map<string, { previousMonth: number; currentMonth: number; allTime: number; salesCount: number }>();

  for (const sale of sales ?? []) {
    const seller = earnings.get(sale.seller_id) ?? { previousMonth: 0, currentMonth: 0, allTime: 0, salesCount: 0 };
    const amount = Number(sale.amount_cents) || 0;
    const soldAt = new Date(sale.sold_at);
    seller.allTime += amount;
    seller.salesCount += 1;
    if (soldAt >= currentStart) seller.currentMonth += amount;
    else if (soldAt >= previousStart) seller.previousMonth += amount;
    earnings.set(sale.seller_id, seller);
  }

  return (profiles ?? []).map((profile: any) => ({
    ...profile,
    earnings: earnings.get(profile.id) ?? { previousMonth: 0, currentMonth: 0, allTime: 0, salesCount: 0 },
  })).sort((a: any, b: any) => b.earnings.allTime - a.earnings.allTime);
});

async function requireAdminUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admins only");
  return supabaseAdmin;
}

export const suspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(input))
  .handler(async ({ context, data }) => {
    if (context.userId === data.userId) throw new Error("You cannot suspend your own admin account.");
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { data: targetAdmin, error: targetRoleError } = await db.from("user_roles").select("role").eq("user_id", data.userId).eq("role", "admin").maybeSingle();
    if (targetRoleError) throw new Error(targetRoleError.message);
    if (targetAdmin) throw new Error("Admin accounts cannot be suspended.");

    const { error: profileError } = await db.from("profiles").update({
      suspended_at: new Date().toISOString(),
      suspension_reason: data.reason?.trim() || null,
    }).eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
    if (authError) throw new Error(authError.message);
    return true;
  });

export const unsuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { error: profileError } = await db.from("profiles").update({ suspended_at: null, suspension_reason: null }).eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
    if (authError) throw new Error(authError.message);
    return true;
  });
