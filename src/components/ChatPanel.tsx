import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, MapPin, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDayTime, formatTime } from "@/lib/format";

type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ThreadDetails = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  meetup_at: string | null;
  meetup_place: string | null;
};

const QUICK_LINES = [
  "Hey! Are these notes still available?",
  "Can we meet after class tomorrow?",
  "I'll have the cash on me — where's good for you?",
];

export function ChatPanel({
  thread,
  userId,
  otherName,
  listingTitle,
}: {
  thread: ThreadDetails;
  userId: string;
  otherName: string;
  listingTitle: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [meetupAt, setMeetupAt] = useState(
    thread.meetup_at ? new Date(thread.meetup_at).toISOString().slice(0, 16) : "",
  );
  const [meetupPlace, setMeetupPlace] = useState(thread.meetup_place ?? "");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ["messages", thread.id],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, thread_id, sender_id, body, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`thread-${thread.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${thread.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", thread.id] });
          queryClient.invalidateQueries({ queryKey: ["threads"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread.id, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data?.length]);

  const sendMessage = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("messages")
        .insert({ thread_id: thread.id, sender_id: userId, body });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", thread.id] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMeetup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("threads")
        .update({
          meetup_at: meetupAt ? new Date(meetupAt).toISOString() : null,
          meetup_place: meetupPlace || null,
        })
        .eq("id", thread.id);
      if (error) throw new Error(error.message);

      const summary = `📍 Meetup plan: ${meetupPlace || "TBC"}${
        meetupAt ? ` at ${formatDayTime(new Date(meetupAt).toISOString())}` : ""
      }`;
      await supabase
        .from("messages")
        .insert({ thread_id: thread.id, sender_id: userId, body: summary });
    },
    onSuccess: () => {
      toast.success("Meetup plan saved");
      queryClient.invalidateQueries({ queryKey: ["thread", thread.id] });
      queryClient.invalidateQueries({ queryKey: ["messages", thread.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const messages = messagesQuery.data ?? [];

  return (
    <div className="paper-card flex h-[70vh] min-h-[480px] flex-col overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Cash sale chat · {listingTitle}
        </p>
        <h2 className="text-lg font-semibold">{otherName}</h2>
        {(thread.meetup_at || thread.meetup_place) && (
          <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-accent">
            {thread.meetup_at && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                {formatDayTime(thread.meetup_at)}
              </span>
            )}
            {thread.meetup_place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {thread.meetup_place}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messagesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Say hi and suggest a time and place to swap cash for notes.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_LINES.map((line) => (
                <Button
                  key={line}
                  size="sm"
                  variant="outline"
                  onClick={() => sendMessage.mutate(line)}
                >
                  {line}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === userId;
            return (
              <div key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    mine
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-bubble-mine px-4 py-2 text-bubble-mine-foreground"
                      : "max-w-[80%] rounded-2xl rounded-bl-sm bg-bubble-theirs px-4 py-2 text-bubble-theirs-foreground"
                  }
                >
                  <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                  <p className="mt-1 text-[11px] opacity-70">{formatTime(message.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-secondary/40 px-5 py-3">
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Plan the meetup (time &amp; place)
          </summary>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              type="datetime-local"
              value={meetupAt}
              onChange={(event) => setMeetupAt(event.target.value)}
              aria-label="Meetup time"
            />
            <Input
              placeholder="Library entrance, front steps…"
              value={meetupPlace}
              onChange={(event) => setMeetupPlace(event.target.value)}
              aria-label="Meetup place"
            />
            <Button onClick={() => saveMeetup.mutate()} disabled={saveMeetup.isPending}>
              Save plan
            </Button>
          </div>
        </details>
      </div>

      <form
        className="flex items-end gap-2 border-t border-border px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (body) sendMessage.mutate(body);
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const body = draft.trim();
              if (body) sendMessage.mutate(body);
            }
          }}
          placeholder={`Message ${otherName}…`}
          rows={2}
          className="min-h-[52px] resize-none bg-card"
        />
        <Button type="submit" size="icon" disabled={sendMessage.isPending || !draft.trim()}>
          {sendMessage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
