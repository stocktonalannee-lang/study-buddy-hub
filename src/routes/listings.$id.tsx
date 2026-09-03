import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, MessageSquare, Sparkle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getListing, getNoteDownloadUrl } from "@/lib/listings.functions";
import { formatPrice } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const listingQuery = (id: string) =>
  queryOptions({
    queryKey: ["listing", id],
    queryFn: () => getListing({ data: { id } }),
  });

export const Route = createFileRoute("/listings/$id")({
  staticData: { sitemap: true },
  loader: async ({ context, params }) => {
    const listing = await context.queryClient.ensureQueryData(listingQuery(params.id));
    if (!listing) throw notFound();
    return listing;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Notes unavailable — NoteSwap" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.title} — ${loaderData.subject} notes on NoteSwap`;
    const description = `${formatPrice(loaderData.price_cents, loaderData.is_free)} · notes from ${loaderData.seller_name}. Message them to arrange a cash meetup.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Couldn't load this listing</h1>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">These notes are gone</h1>
      <Button asChild className="mt-4">
        <Link to="/browse">Browse other notes</Link>
      </Button>
    </div>
  ),
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const { data: listing } = useSuspenseQuery(listingQuery(id));
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!listing) return null;

  const isSeller = user?.id === listing.seller_id;

  async function openChat() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setBusy(true);
    try {
      const existing = await supabase
        .from("threads")
        .select("id")
        .eq("listing_id", listing!.id)
        .eq("buyer_id", user.id)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);

      let threadId = existing.data?.id;
      if (!threadId) {
        const created = await supabase
          .from("threads")
          .insert({
            listing_id: listing!.id,
            buyer_id: user.id,
            seller_id: listing!.seller_id,
          })
          .select("id")
          .single();
        if (created.error) throw new Error(created.error.message);
        threadId = created.data.id;
      }
      navigate({ to: "/messages/$threadId", params: { threadId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open the chat");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setBusy(true);
    try {
      const result = await getNoteDownloadUrl({ data: { listingId: listing!.id } });
      if (!result.url) {
        toast.error(result.reason ?? "Download not available");
        return;
      }
      window.open(result.url, "_blank", "noopener");
    } catch {
      toast.error("Couldn't create a download link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/browse" className="text-sm text-muted-foreground hover:underline">
        ← Back to browse
      </Link>

      <div className="paper-card mt-4 p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {listing.subject}
          {listing.course_code ? ` · ${listing.course_code}` : ""}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{listing.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
            {formatPrice(listing.price_cents, listing.is_free)}
          </span>
          <span className="text-muted-foreground">
            by <span className="font-medium text-foreground">{listing.seller_name}</span>
            {listing.seller_school ? ` · ${listing.seller_school}` : ""}
          </span>
          {listing.seller_is_top && (
            <Badge variant="secondary" className="gap-1">
              <Sparkle className="h-3 w-3" aria-hidden="true" />
              Top student
            </Badge>
          )}
          {listing.page_count ? (
            <span className="text-muted-foreground">{listing.page_count} pages</span>
          ) : null}
        </div>

        {listing.description && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {listing.description}
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          {!isSeller && (
            <Button onClick={openChat} disabled={busy} size="lg">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Message {listing.seller_name} about a cash meetup
            </Button>
          )}
          {listing.has_file && (listing.is_free || isSeller) && (
            <Button variant="outline" size="lg" onClick={download} disabled={busy}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {listing.is_free ? "Free download" : "Download your file"}
            </Button>
          )}
          {isSeller && (
            <Button asChild variant="ghost" size="lg">
              <Link to="/sell">Manage my listings</Link>
            </Button>
          )}
        </div>

        {!listing.is_free && (
          <p className="mt-4 text-xs text-muted-foreground">
            Payment happens in person, in cash. Meet somewhere public on campus.
          </p>
        )}
      </div>
    </div>
  );
}
