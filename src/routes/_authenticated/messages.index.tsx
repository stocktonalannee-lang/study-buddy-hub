import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDayTime } from "@/lib/format";

type ThreadRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  meetup_place: string | null;
  meetup_at: string | null;
  listings: { title: string; subject: string } | null;
};

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "Your chats — NoteSwap" },
      {
        name: "description",
        content: "Every conversation you have about a set of notes, with the meetup plan attached.",
      },
      { property: "og:title", content: "Your chats — NoteSwap" },
      { property: "og:description", content: "Conversations and meetup plans for your notes." },
    ],
  }),
  component: Inbox,
});

function Inbox() {
  const { user } = useAuth();

  const threads = useQuery({
    queryKey: ["threads", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<ThreadRow[]> => {
      const { data, error } = await supabase
        .from("threads")
        .select(
          "id, buyer_id, seller_id, last_message_at, meetup_place, meetup_at, listings:listing_id (title, subject)",
        )
        .order("last_message_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ThreadRow[];
    },
  });

  const rows = threads.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Your chats</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        One thread per set of notes, so meetup plans never get mixed up.
      </p>

      {threads.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="paper-card mt-6 p-8 text-center">
          <MessagesSquare className="mx-auto h-6 w-6 text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            No chats yet. Open a listing and message the seller to get started.
          </p>
          <Button asChild className="mt-4">
            <Link to="/browse">Browse notes</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((thread) => (
            <li key={thread.id}>
              <Link
                to="/messages/$threadId"
                params={{ threadId: thread.id }}
                className="paper-card block p-5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{thread.listings?.title ?? "Notes"}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatDayTime(thread.last_message_at)}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {thread.seller_id === user?.id ? "You're selling" : "You're buying"}
                  {thread.listings?.subject ? ` · ${thread.listings.subject}` : ""}
                </p>
                {(thread.meetup_place || thread.meetup_at) && (
                  <p className="mt-2 text-sm text-accent">
                    Meetup: {thread.meetup_place ?? "TBC"}
                    {thread.meetup_at ? ` · ${formatDayTime(thread.meetup_at)}` : ""}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
