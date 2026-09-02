import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ChatPanel, type ThreadDetails } from "@/components/ChatPanel";

type ThreadWithContext = ThreadDetails & {
  listings: { title: string; is_sold: boolean } | null;
  buyer: { display_name: string } | null;
  seller: { display_name: string } | null;
};

export const Route = createFileRoute("/_authenticated/messages/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat about these notes — NoteSwap" },
      {
        name: "description",
        content: "Message your classmate and agree on a time and place for the cash handover.",
      },
      { property: "og:title", content: "Chat about these notes — NoteSwap" },
      { property: "og:description", content: "Agree on a time and place for the cash handover." },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { user } = useAuth();

  const threadQuery = useQuery({
    queryKey: ["thread", threadId],
    enabled: Boolean(user),
    queryFn: async (): Promise<ThreadWithContext | null> => {
      const { data, error } = await supabase
        .from("threads")
        .select(
          "id, listing_id, buyer_id, seller_id, meetup_at, meetup_place, listings:listing_id (title, is_sold), buyer:buyer_id (display_name), seller:seller_id (display_name)",
        )
        .eq("id", threadId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as ThreadWithContext | null;
    },
  });

  if (!user || threadQuery.isLoading) {
    return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Loading…</p>;
  }

  const thread = threadQuery.data;
  if (!thread) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Chat not found</h1>
        <Link to="/messages" className="mt-3 inline-block text-sm hover:underline">
          Back to your chats
        </Link>
      </div>
    );
  }

  const iAmSeller = thread.seller_id === user.id;
  const otherName =
    (iAmSeller ? thread.buyer?.display_name : thread.seller?.display_name) ?? "Classmate";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/messages" className="text-sm text-muted-foreground hover:underline">
          ← All chats
        </Link>
        <Link
          to="/listings/$id"
          params={{ id: thread.listing_id }}
          className="text-sm text-accent hover:underline"
        >
          View the listing
        </Link>
      </div>

      <ChatPanel
        thread={thread}
        userId={user.id}
        otherName={otherName}
        listingTitle={thread.listings?.title ?? "Notes"}
      />
    </div>
  );
}
