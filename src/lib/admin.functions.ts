import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Centralized commission configuration. Change this one value in the future.
export const COMMISSION_RATE = 0.10;

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
      commission_rate: COMMISSION_RATE,
      commission_cents: Math.round(listing.price_cents * COMMISSION_RATE),
      sold_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const createSaleRemovalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ saleId: z.string().uuid(), reason: z.string().min(5).max(1000) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: sale, error: saleError } = await db.from("sales").select("id, seller_id, status").eq("id", data.saleId).maybeSingle();
    if (saleError) throw new Error(saleError.message);
    if (!sale || sale.seller_id !== context.userId) throw new Error("Sale not found.");
    if (sale.status !== "active") throw new Error("This sale is already under review or removed.");
    const { data: existing } = await db.from("sale_removal_requests").select("id").eq("sale_id", data.saleId).in("status", ["pending"]).maybeSingle();
    if (existing) throw new Error("A request for this sale is already pending.");
    const { error } = await db.from("sale_removal_requests").insert({ sale_id: data.saleId, requester_id: context.userId, reason: data.reason.trim() });
    if (error) throw new Error(error.message);
    return true;
  });

export const getSupportSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data, error } = await db.from("sales").select("id, listing_id, amount_cents, sold_at, status").eq("seller_id", context.userId).eq("status", "active").order("sold_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSaleRemovalRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { data, error } = await db.from("sale_removal_requests").select("id, sale_id, requester_id, reason, status, created_at").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const reviewSaleRemovalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid(), approve: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const status = data.approve ? "approved" : "rejected";
    const { data: request, error: requestError } = await db.from("sale_removal_requests").select("id, sale_id, status").eq("id", data.requestId).maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request || request.status !== "pending") throw new Error("Request is no longer pending.");
    const { error: requestUpdateError } = await db.from("sale_removal_requests").update({ status, reviewed_by: context.userId, reviewed_at: new Date().toISOString() }).eq("id", data.requestId);
    if (requestUpdateError) throw new Error(requestUpdateError.message);
    if (data.approve) {
      const { error: saleError } = await db.from("sales").update({ status: "voided", voided_at: new Date().toISOString(), voided_by: context.userId }).eq("id", request.sale_id).eq("status", "active");
      if (saleError) throw new Error(saleError.message);
    }
    return true;
  });

export type AdminListing = {
  id: string;
  title: string;
  subject: string;
  course_code: string | null;
  price_cents: number;
  is_free: boolean;
  is_hidden: boolean;
  file_path: string | null;
  page_count: number | null;
  created_at: string;
  archived_at: string | null;
  seller_id: string;
  seller_name: string;
  seller_school: string | null;
  sales_count: number;
};

export const getAdminListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const [{ data: listings, error: listingsError }, { data: sales, error: salesError }] = await Promise.all([
      db.from("listings").select("id, title, subject, course_code, price_cents, is_free, is_hidden, file_path, page_count, created_at, archived_at, seller_id, profiles!listings_seller_profile_fkey(display_name, school)").order("created_at", { ascending: false }).limit(2000),
      db.from("sales").select("listing_id, status"),
    ]);
    if (listingsError) throw new Error(listingsError.message);
    if (salesError) throw new Error(salesError.message);
    const salesCount = new Map<string, number>();
    for (const sale of sales ?? []) {
      if (sale.status === "active") salesCount.set(sale.listing_id, (salesCount.get(sale.listing_id) ?? 0) + 1);
    }
    return (listings ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      subject: row.subject,
      course_code: row.course_code,
      price_cents: row.price_cents,
      is_free: row.is_free,
      is_hidden: row.is_hidden,
      file_path: row.file_path,
      page_count: row.page_count,
      created_at: row.created_at,
      archived_at: row.archived_at,
      seller_id: row.seller_id,
      seller_name: row.profiles?.display_name ?? "Student",
      seller_school: row.profiles?.school ?? null,
      sales_count: salesCount.get(row.id) ?? 0,
    })) as AdminListing[];
  });

/** Admin-only temporary access to a note file. No sale is created. */
export const getAdminNoteDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { data: listing, error } = await db.from("listings").select("id, file_path").eq("id", data.listingId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!listing?.file_path) return { url: null as string | null, reason: "No file attached" };
    const signed = await supabaseAdmin.storage.from("notes").createSignedUrl(listing.file_path, 60 * 10);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, reason: null as string | null };
  });

export const archiveListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { error } = await db.from("listings").update({ is_hidden: true, archived_at: new Date().toISOString(), archived_by: context.userId }).eq("id", data.listingId);
    if (error) throw new Error(error.message);
    return true;
  });

export const relistListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid(), priceCents: z.number().int().min(0).max(1000000) }).parse(input))
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await requireAdminUser(context.userId);
    const db = supabaseAdmin as any;
    const { data: listing, error: lookupError } = await db.from("listings").select("id, is_free").eq("id", data.listingId).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!listing) throw new Error("Listing not found.");
    const { error } = await db.from("listings").update({ is_hidden: false, archived_at: null, archived_by: null, is_sold: false, price_cents: listing.is_free ? 0 : data.priceCents, is_free: listing.is_free }).eq("id", data.listingId);
    if (error) throw new Error(error.message);
    return true;
  });

export const getAdminDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const supabaseAdmin = await requireAdminUser(context.userId);
  const db = supabaseAdmin as any;

  const [{ data: profiles, error: profilesError }, { data: sales, error: salesError }, { data: users, error: usersError }] =
    await Promise.all([
      db.from("profiles").select("id, display_name, school, is_top_student, created_at").order("created_at", { ascending: false }).limit(1000),
      db.from("sales").select("seller_id, amount_cents, commission_cents, sold_at, status"),
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
    const commission = Number(sale.commission_cents) || 0;
    const sellerEarnings = Math.max(0, amount - commission);
    const soldAt = new Date(sale.sold_at);
    if (sale.status !== "active") continue;
    e.allTime += sellerEarnings;
    e.salesCount += 1;
    if (soldAt >= currentStart) e.currentMonth += sellerEarnings;
    else if (soldAt >= previousStart) e.previousMonth += sellerEarnings;
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
