import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/ListingCard";
import { listListings } from "@/lib/listings.functions";

const allListings = queryOptions({
  queryKey: ["listings", "all"],
  queryFn: () => listListings({ data: {} }),
});

export const Route = createFileRoute("/browse")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Browse class notes by subject — NoteSwap" },
      {
        name: "description",
        content:
          "Search notes your classmates posted by subject or course code, filter to free downloads, and message the seller to arrange a cash meetup.",
      },
      { property: "og:title", content: "Browse class notes by subject — NoteSwap" },
      {
        property: "og:description",
        content: "Search by subject or course code and filter to free downloads.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allListings),
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Couldn't load notes</h1>
      <p className="mt-2 text-sm text-muted-foreground">Try refreshing the page.</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">Nothing here.</div>,
  component: Browse,
});

function Browse() {
  const { data: listings } = useSuspenseQuery(allListings);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);

  const subjects = useMemo(
    () => Array.from(new Set(listings.map((l) => l.subject))).sort(),
    [listings],
  );

  const filtered = listings.filter((l) => {
    const term = search.trim().toLowerCase();
    const matchesTerm =
      !term ||
      `${l.title} ${l.subject} ${l.course_code ?? ""} ${l.seller_name}`
        .toLowerCase()
        .includes(term);
    return matchesTerm && (!subject || l.subject === subject) && (!freeOnly || l.is_free);
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Browse notes</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {listings.length} listing{listings.length === 1 ? "" : "s"} from classmates.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Search title, subject, course code…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search notes"
          />
        </div>
        <Button
          variant={freeOnly ? "default" : "outline"}
          onClick={() => setFreeOnly((value) => !value)}
        >
          Free only
        </Button>
      </div>

      {subjects.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={subject === null ? "secondary" : "ghost"}
            onClick={() => setSubject(null)}
          >
            All subjects
          </Button>
          {subjects.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={subject === item ? "secondary" : "ghost"}
              onClick={() => setSubject(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="paper-card mt-8 p-8 text-center text-sm text-muted-foreground">
          No notes match that yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
