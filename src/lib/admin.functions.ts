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

export const recordSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: listing, error: listingError } = await db
      .from("listings")
      .select("id, seller_id, price_cents, is_free")
      .eq("id", data.listingId)
      .maybeSingle();
    if (listingError) throw new Error(listingError.message);
    if (!listing) throw new Error("Listing not found.");
    if (listing.seller_id !== context.userId) throw new Error("You can only record sales for your own listings.");
    if (listing.is_free) throw new Error("Free listings do not have sales.");
    const { error } = await db.from("sales").insert({
      listing_id: listing.id,
      seller_id: listing.seller_id,
      amount_cents: listing.price_cents,
      sold_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const getAdminDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const supabaseAdmin = await requireAdminUser(context.userId);
  const db = supabaseAdmin as any;

  const [{ data: profiles, error: profilesError }, { data: sales, error: salesError }, { data: users, error: usersError }] =
    await Promise.all([
      db.from("profiles").select("id, display_name, school, is_top_student, created_at").order("created_at", { ascending: false }).limit(1000),
      db.from("sales").select("seller_id, amount_cents, sold_at"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
  if (profilesError) throw new Error(profilesError.message);
  if (salesError) throw new Error(salesError.message);
  if (usersError) throw new Error(usersError.message);

  const currentStart = new Date();
  currentStart.setDate(1); currentStart.setHours(0, 0, 0, 0);
  const previousStart = new Date(currentStart);
  previousStart.setMonth(previousStart.getMonth() - 1);

  const earnings = new Map<string, { previousMonth: number; currentMonth: number; allTime: number; salesCount: number }>();
  for (const sale of sales ?? []) {
    const e = earnings.get(sale.seller_id) ?? { previousMonth: 0, currentMonth: 0, allTime: 0, salesCount: 0 };
    const amount = Number(sale.amount_cents) || 0;
    const soldAt = new Date(sale.sold_at);
    e.allTime += amount;
    e.salesCount += 1;
    if (soldAt >= currentStart) e.currentMonth += amount;
    else if (soldAt >= previousStart) e.previousMonth += amount;
    earnings.set(sale.seller_id, e);
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
