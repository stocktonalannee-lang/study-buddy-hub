import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { HandCoins, MessagesSquare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/ListingCard";
import { listListings } from "@/lib/listings.functions";
import { SUBSCRIPTIONS_ENABLED, PREMIUM_TIER } from "@/lib/features";

const latestListings = queryOptions({
  queryKey: ["listings", "latest"],
  queryFn: () => listListings({ data: {} }),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NoteSwap — Swap class notes, meet up, pay cash" },
      {
        name: "description",
        content:
          "A note-sharing site for classmates: post your notes, browse by subject, and chat inside each listing to arrange a cash handover.",
      },
      { property: "og:title", content: "NoteSwap — Swap class notes, meet up, pay cash" },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        property: "og:description",
        content: "Post notes, browse by subject, chat per listing and meet on campus for cash.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(latestListings),
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Couldn't load listings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Try refreshing the page.</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">Nothing here.</div>,
  component: Index,
});

function Index() {
  const { data: listings } = useSuspenseQuery(latestListings);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-14">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            For broke students
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            Swap class notes with <span className="marker-underline">your classmates</span>, pay in
            cash.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Post the notes you already wrote. Browse what everyone else has. Every listing has its
            own chat so you can agree on a time and place to meet and hand over the cash — no card,
            no fees, no subscription.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/browse">Browse notes</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/sell">Post your notes</Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Upload,
              title: "1. Post your notes",
              text: "Add a subject, a price and (optionally) the file. Free notes are downloadable instantly.",
            },
            {
              icon: MessagesSquare,
              title: "2. Chat in the listing",
              text: "Each buyer gets a private thread tied to that listing, so plans never get mixed up.",
            },
            {
              icon: HandCoins,
              title: "3. Meet and pay cash",
              text: "Pin a time and spot in the chat, meet on campus, mark it sold. Zero fees.",
            },
          ].map((step) => (
            <div key={step.title} className="paper-card p-5">
              <step.icon className="h-5 w-5 text-accent" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">Latest notes</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/browse">See all</Link>
          </Button>
        </div>

        {listings.length === 0 ? (
          <div className="paper-card mt-5 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing posted yet — be the first and your notes will sit right here.
            </p>
            <Button asChild className="mt-4">
              <Link to="/sell">Post notes</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.slice(0, 6).map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        {SUBSCRIPTIONS_ENABLED && (
          <div className="paper-card mt-10 p-6">
            <h2 className="text-xl font-semibold">{PREMIUM_TIER.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{PREMIUM_TIER.blurb}</p>
            <p className="mt-2 font-semibold">{PREMIUM_TIER.priceLabel}</p>
          </div>
        )}
      </section>
    </div>
  );
}
