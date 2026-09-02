import { Link } from "@tanstack/react-router";
import { FileText, Sparkle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicListing } from "@/lib/listings.functions";
import { formatPrice } from "@/lib/format";

export function ListingCard({ listing }: { listing: PublicListing }) {
  return (
    <Link
      to="/listings/$id"
      params={{ id: listing.id }}
      className="paper-card group flex flex-col gap-3 p-5 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {listing.subject}
            {listing.course_code ? ` · ${listing.course_code}` : ""}
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-snug">{listing.title}</h3>
        </div>
        <span className="whitespace-nowrap rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">
          {formatPrice(listing.price_cents, listing.is_free)}
        </span>
      </div>

      {listing.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{listing.seller_name}</span>
        {listing.seller_is_top && (
          <Badge variant="secondary" className="gap-1">
            <Sparkle className="h-3 w-3" aria-hidden="true" />
            Top student
          </Badge>
        )}
        {listing.has_file && (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" aria-hidden="true" />
            {listing.is_free ? "Free download" : "File included"}
          </span>
        )}
        {listing.page_count ? <span>{listing.page_count} pages</span> : null}
        {listing.is_sold && <Badge variant="outline">Sold</Badge>}
      </div>
    </Link>
  );
}
