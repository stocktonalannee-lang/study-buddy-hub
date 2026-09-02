import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Archive, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminListings, getAdminNoteDownloadUrl, archiveListing, relistListing } from "@/lib/admin.functions";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function AdminNotesPanel() {
  const queryClient = useQueryClient();
  const fetchListings = useServerFn(getAdminListings);
  const getAdminDownload = useServerFn(getAdminNoteDownloadUrl);
  const doArchive = useServerFn(archiveListing);
  const doRelist = useServerFn(relistListing);
  const [search, setSearch] = useState("");

  const notes = useQuery({ queryKey: ["admin-listings"], queryFn: () => fetchListings() });
  const archive = useMutation({
    mutationFn: (listingId: string) => doArchive({ data: { listingId } }),
    onSuccess: () => { toast.success("Note archived and preserved"); queryClient.invalidateQueries({ queryKey: ["admin-listings"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const relist = useMutation({
    mutationFn: ({ listingId, priceCents }: { listingId: string; priceCents: number }) => doRelist({ data: { listingId, priceCents } }),
    onSuccess: () => { toast.success("Note relisted"); queryClient.invalidateQueries({ queryKey: ["admin-listings"] }); queryClient.invalidateQueries({ queryKey: ["listings"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  async function viewNote(listingId: string) {
    try {
      const result = await getAdminDownload({ data: { listingId } });
      if (!result.url) { toast.error(result.reason ?? "Note file unavailable"); return; }
      window.open(result.url, "_blank", "noopener");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't open note"); }
  }

  const listings = (notes.data ?? []).filter((listing) => !search || `${listing.title} ${listing.subject} ${listing.seller_name}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Marketplace notes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review note files without purchasing. Archive strong notes to preserve them for future relisting.</p>
        </div>
        <Input className="max-w-sm" placeholder="Search notes or seller…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search marketplace notes" />
      </div>

      {notes.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading notes…</p> : listings.length === 0 ? <p className="paper-card mt-4 p-6 text-sm text-muted-foreground">No notes found.</p> : (
        <div className="mt-4 space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="paper-card flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{listing.title}</span>
                  {listing.archived_at ? <Badge variant="outline">Archived</Badge> : listing.is_hidden ? <Badge variant="secondary">Hidden</Badge> : <Badge>Live</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{listing.subject}{listing.course_code ? ` · ${listing.course_code}` : ""} · {listing.seller_name}{listing.seller_school ? ` · ${listing.seller_school}` : ""}</p>
                <p className="text-xs text-muted-foreground">{listing.sales_count} active sale{listing.sales_count === 1 ? "" : "s"} · {listing.is_free ? "Free" : money(listing.price_cents)}{listing.page_count ? ` · ${listing.page_count} pages` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.file_path && <Button size="sm" variant="outline" onClick={() => viewNote(listing.id)}><Eye className="mr-1 h-4 w-4" />View note</Button>}
                {!listing.archived_at && <Button size="sm" variant="outline" onClick={() => { if (window.confirm("Archive this note? It will be hidden from browsing but its file and sales history will be preserved.")) archive.mutate(listing.id); }} disabled={archive.isPending}><Archive className="mr-1 h-4 w-4" />Archive</Button>}
                {listing.archived_at && <Button size="sm" onClick={() => { const current = listing.is_free ? 0 : Number(window.prompt("Relist price in dollars:", (listing.price_cents / 100).toFixed(2)) ?? ""); if (!Number.isFinite(current) || current < 0) { toast.error("Enter a valid price."); return; } relist.mutate({ listingId: listing.id, priceCents: Math.round(current * 100) }); }} disabled={relist.isPending}><RotateCcw className="mr-1 h-4 w-4" />Relist</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
