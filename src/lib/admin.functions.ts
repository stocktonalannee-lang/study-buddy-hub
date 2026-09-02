import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdminUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admins only");
  return supabaseAdmin;
}

export const checkAnyAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
});

export const claimFirstAdmin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return false;
  const { error: insertError } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
  if (insertError) throw new Error(insertError.message);
  return true;
});

export const checkSuspended = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(context.userId);
  if (error) throw new Error(error.message);
  const bannedUntil = data.user?.banned_until;
  const suspended = Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now());
  return { suspended, reason: null };
});

export const getAdminDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const supabaseAdmin = await requireAdminUser(context.userId);
  const db = supabaseAdmin as any;

  const [{ data: profiles, error: profilesError }, { data: salesListings, error: listingsError }, { data: users, error: usersError }, { data: roles, error: rolesError }] =
    await Promise.all([
      db.from("profiles").select("id, display_name, school, is_top_student, created_at").order("created_at", { ascending: false }).limit(1000),
      db.from("listings").select("id, seller_id, price_cents, is_free, is_sold, updated_at").eq("is_sold", true).eq("is_free", false),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      db.from("user_roles").select("user_id, role"),
    ]);

  if (profilesError) throw new Error(profilesError.message);
  if (listingsError) throw new Error(listingsError.message);
  if (usersError) throw new Error(usersError.message);
  if (rolesError) throw new Error(rolesError.message);

  const currentStart = new Date();
  currentStart.setDate(1); currentStart.setHours(0, 0, 0, 0);
  const previousStart = new Date(currentStart);
  previousStart.setMonth(previousStart.getMonth() - 1);

  const earnings = new Map<string, { previousMonth: number; currentMonth: number; allTime: number; salesCount: number }>();
  for (const listing of salesListings ?? []) {
    const e = earnings.get(listing.seller_id) ?? { previousMonth: 0, currentMonth: 0, allTime: 0, salesCount: 0 };
    const amount = Number(listing.price_cents) || 0;
    const soldAt = new Date(listing.updated_at);
    e.allTime += amount;
    e.salesCount += 1;
    if (soldAt >= currentStart) e.currentMonth += amount;
    else if (soldAt >= previousStart) e.previousMonth += amount;
    earnings.set(listing.seller_id, e);
  }

  const suspendedIds = new Set(
    (users?.users ?? [])
      .filter((u) => u.banned_until && new Date(u.banned_until).getTime() > Date.now())
      .map((u) => u.id),
  );

  return (profiles ?? []).map((profile: any) => ({
    ...profile,
    suspended_at: suspendedIds.has(profile.id) ? "suspended" : null,
    suspension_reason: null,
    earnings: earnings.get(profile.id) ?? { previousMonth: 0, currentMonth: 0, allTime: 0, salesCount: 0 },
  })).sort((a: any, b: any) => b.earnings.allTime - a.earnings.allTime);
});

export const suspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(input))
  .handler(async ({ context, data }) => {
    if (context.userId === data.userId) throw new Error("You cannot suspend your own admin account.");
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { data: targetAdmin, error } = await db.from("user_roles").select("role").eq("user_id", data.userId).eq("role", "admin").maybeSingle();
    if (error) throw new Error(error.message);
    if (targetAdmin) throw new Error("Admin accounts cannot be suspended.");
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
    if (banError) throw new Error(banError.message);
    return true;
  });

export const unsuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
    if (error) throw new Error(error.message);
    return true;
  });
