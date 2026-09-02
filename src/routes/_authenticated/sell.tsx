import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sell")({
  head: () => ({
    meta: [
      { title: "Post your class notes — NoteSwap" },
      {
        name: "description",
        content:
          "Post notes for classmates: set a subject, a cash price or a free download, and attach the file.",
      },
      { property: "og:title", content: "Post your class notes — NoteSwap" },
      {
        property: "og:description",
        content: "Set a subject, a cash price or free download, and attach your file.",
      },
    ],
  }),
  component: SellPage,
});

function SellPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("5");
  const [pageCount, setPageCount] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const myListings = useQuery({
    queryKey: ["my-listings", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, subject, price_cents, is_free, is_sold, created_at")
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const createListing = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      let filePath: string | null = null;

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${user.id}/${Date.now()}-${safeName}`;
        const upload = await supabase.storage.from("notes").upload(path, file);
        if (upload.error) throw new Error(upload.error.message);
        filePath = path;
      }

      const { error } = await supabase.from("listings").insert({
        seller_id: user.id,
        title: title.trim(),
        subject: subject.trim(),
        course_code: courseCode.trim() || null,
        description: description.trim() || null,
        price_cents: isFree ? 0 : Math.round(Number(price || 0) * 100),
        is_free: isFree,
        page_count: pageCount ? Number(pageCount) : null,
        file_path: filePath,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Notes posted");
      setTitle("");
      setSubject("");
      setCourseCode("");
      setDescription("");
      setPageCount("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleSold = useMutation({
    mutationFn: async ({ id, sold }: { id: string; sold: boolean }) => {
      const { error } = await supabase.from("listings").update({ is_sold: sold }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const removeListing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Listing removed");
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h1 className="text-3xl font-semibold">Post your notes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set a cash price or give them away free. Buyers message you in the listing chat to arrange
          a meetup.
        </p>

        <form
          className="paper-card mt-6 space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            createListing.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Full semester chemistry notes"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Chemistry"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course">Course code (optional)</Label>
              <Input
                id="course"
                value={courseCode}
                onChange={(event) => setCourseCode(event.target.value)}
                placeholder="CHEM 101"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">What's in them?</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Every lecture, diagrams redrawn, plus past-paper answers."
            />
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="free" className="flex items-center gap-2">
                  Give these away free
                  {isVerifiedSharer ? (
                    <Badge variant="secondary" className="gap-1">
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      Verified sharer
                    </Badge>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isVerifiedSharer
                    ? "Free notes can be downloaded instantly by any signed-in classmate."
                    : "Free samples need an admin to verify your account first. Cash listings are open to everyone."}
                </p>
              </div>
              <Switch
                id="free"
                checked={isFree}
                disabled={!isVerifiedSharer}
                onCheckedChange={setIsFree}
              />
            </div>
          </div>


          <div className="grid gap-4 sm:grid-cols-2">
            {!isFree && (
              <div className="space-y-1.5">
                <Label htmlFor="price">Cash price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.5"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pages">Pages (optional)</Label>
              <Input
                id="pages"
                type="number"
                min="1"
                value={pageCount}
                onChange={(event) => setPageCount(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="file">Attach the notes file (optional, max 25MB)</Label>
            <Input
              id="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Paid files stay private — hand them over when you meet. Free files are downloadable
              straight away.
            </p>
          </div>

          <Button type="submit" size="lg" disabled={createListing.isPending}>
            {createListing.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Post notes
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Your listings</h2>
        {myListings.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : (myListings.data ?? []).length === 0 ? (
          <p className="paper-card mt-4 p-6 text-sm text-muted-foreground">
            Nothing posted yet. Your listings will show up here.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(myListings.data ?? []).map((listing) => (
              <li key={listing.id} className="paper-card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/listings/$id"
                    params={{ id: listing.id }}
                    className="truncate font-medium hover:underline"
                  >
                    {listing.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {listing.subject} · {formatPrice(listing.price_cents, listing.is_free)}
                  </p>
                </div>
                {listing.is_sold && <Badge variant="outline">Sold</Badge>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleSold.mutate({ id: listing.id, sold: !listing.is_sold })}
                >
                  {listing.is_sold ? "Mark available" : "Mark sold"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete listing"
                  onClick={() => removeListing.mutate(listing.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
