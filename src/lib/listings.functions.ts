import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PublicListing = {
  id: string;
  title: string;
  subject: string;
  course_code: string | null;
  description: string | null;
  price_cents: number;
  is_free: boolean;
  page_count: number | null;
  has_file: boolean;
  created_at: string;
  seller_id: string;
  seller_name: string;
  seller_school: string | null;
  seller_is_top: boolean;
};

const listingRowSelect =
  "id, title, subject, course_code, description, price_cents, is_free, page_count, file_path, created_at, seller_id, profiles!listings_seller_profile_fkey (display_name, school, is_top_student)";

type RawRow = {
  id: string;
  title: string;
  subject: string;
  course_code: string | null;
  description: string | null;
  price_cents: number;
  is_free: boolean;
  page_count: number | null;
  file_path: string | null;
  created_at: string;
  seller_id: string;
  profiles: { display_name: string; school: string | null; is_top_student: boolean } | null;
};

function toPublic(row: RawRow): PublicListing {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    course_code: row.course_code,
    description: row.description,
    price_cents: row.price_cents,
    is_free: row.is_free,
    page_count: row.page_count,
    has_file: Boolean(row.file_path),
    created_at: row.created_at,
    seller_id: row.seller_id,
    seller_name: row.profiles?.display_name ?? "Student",
    seller_school: row.profiles?.school ?? null,
    seller_is_top: row.profiles?.is_top_student ?? false,
  };
}

export const listListings = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(120).optional(),
        subject: z.string().max(60).optional(),
        freeOnly: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { getPublicClient } = await import("./supabase-public.server");
    let query = getPublicClient()
      .from("listings")
      .select(listingRowSelect)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(60);

    if (data.subject) query = query.eq("subject", data.subject);
    if (data.freeOnly) query = query.eq("is_free", true);
    if (data.search) {
      const term = `%${data.search.replace(/[%_,]/g, "")}%`;
      query = query.or(`title.ilike.${term},subject.ilike.${term},course_code.ilike.${term}`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as RawRow[]).map(toPublic);
  });

export const getListing = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getPublicClient } = await import("./supabase-public.server");
    const { data: row, error } = await getPublicClient()
      .from("listings")
      .select(listingRowSelect)
      .eq("id", data.id)
      .eq("is_hidden", false)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;
    return toPublic(row as unknown as RawRow);
  });

/** Temporary download link. Only free notes, or the seller's own file. */
export const getNoteDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: listing, error } = await context.supabase
      .from("listings")
      .select("id, seller_id, is_free, file_path")
      .eq("id", data.listingId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!listing?.file_path) return { url: null as string | null, reason: "No file attached" };

    const isSeller = listing.seller_id === context.userId;
    if (!listing.is_free && !isSeller) {
      return { url: null as string | null, reason: "Arrange a cash sale in chat first" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("notes")
      .createSignedUrl(listing.file_path, 60 * 5);

    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, reason: null as string | null };
  });
