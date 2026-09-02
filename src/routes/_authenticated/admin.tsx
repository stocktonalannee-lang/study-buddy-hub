import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Crown, DollarSign, ShieldCheck, UserRoundX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { checkAnyAdmin, claimFirstAdmin, getAdminDashboard, suspendUser, unsuspendUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Verify sharers — NoteSwap admin" },
      {
        name: "description",
        content:
          "Admin tools for NoteSwap: verify which students are allowed to post free note samples.",
      },
      { property: "og:title", content: "Verify sharers — NoteSwap admin" },
      {
        property: "og:description",
        content: "Approve the students allowed to post free note samples.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Row = {
  id: string; display_name: string; school: string | null; is_top_student: boolean;
  suspended_at: string | null; suspension_reason: string | null; created_at: string;
  earnings: { previousMonth: number; currentMonth: number; allTime: number; salesCount: number };
};
function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, isLoading: rolesLoading } = useRoles();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const fetchAnyAdmin = useServerFn(checkAnyAdmin);
  const doClaimAdmin = useServerFn(claimFirstAdmin);
  const fetchDashboard = useServerFn(getAdminDashboard);
  const doSuspend = useServerFn(suspendUser);
  const doUnsuspend = useServerFn(unsuspendUser);

  const anyAdmin = useQuery({
    queryKey: ["any-admin"],
    enabled: !isAdmin,
    queryFn: () => fetchAnyAdmin(),
  });

  const claimAdmin = useMutation({
    mutationFn: async () => doClaimAdmin(),
    onSuccess: (becameAdmin) => {
      if (becameAdmin) {
        toast.success("You're now the first admin.");
        queryClient.invalidateQueries({ queryKey: ["roles", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["any-admin"] });
      } else {
        toast.error("An admin already exists. Ask them to verify your account.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const students = useQuery({
    queryKey: ["admin-dashboard"],
    enabled: isAdmin,
    queryFn: () => fetchDashboard(),
  });

  const grantedRoles = useQuery({
    queryKey: ["admin-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const setVerified = useMutation({
    mutationFn: async ({ userId, verified }: { userId: string; verified: boolean }) => {
      if (verified) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "verified_sharer", granted_by: user?.id ?? null });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "verified_sharer");
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.verified ? "Student verified" : "Verification removed");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setTopStudent = useMutation({
    mutationFn: async ({ userId, top }: { userId: string; top: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_top_student: top })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suspension = useMutation({
    mutationFn: async ({ userId, suspended }: { userId: string; suspended: boolean }) => {
      if (suspended) {
        if (!window.confirm("Suspend this account? They will be unable to sign in or use the marketplace.")) return false;
        const reason = window.prompt("Optional suspension reason:") ?? "";
        return doSuspend({ data: { userId, reason } });
      }
      return doUnsuspend({ data: { userId } });
    },
    onSuccess: (changed) => {
      if (!changed) return;
      toast.success("Account status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (rolesLoading || (!isAdmin && anyAdmin.isLoading)) {
    return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!isAdmin) {
    if (anyAdmin.data === false) {
      return (
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <Crown className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold">Claim admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No admin exists yet. As the first signed-in user, you can claim admin access so you're
            able to verify sharers.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => claimAdmin.mutate()} disabled={claimAdmin.isPending}>
              {claimAdmin.isPending ? "Claiming…" : "Become admin"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/browse">Back to browsing</Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <ShieldCheck className="mx-auto h-7 w-7 text-accent" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is for site admins who verify which students can post free samples.
        </p>
        <Button asChild className="mt-5">
          <Link to="/browse">Back to browsing</Link>
        </Button>
      </div>
    );
  }

  const verifiedIds = new Set(
    (grantedRoles.data ?? [])
      .filter((row) => row.role === "verified_sharer")
      .map((row) => row.user_id),
  );
  const adminIds = new Set(
    (grantedRoles.data ?? []).filter((row) => row.role === "admin").map((row) => row.user_id),
  );

  const rows = (students.data ?? []).filter((row) =>
    search
      ? `${row.display_name} ${row.school ?? ""}`.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Admin dashboard</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Anyone can list notes for a cash meetup. Posting <strong>free downloads</strong> requires
        your verification, so nobody can dump junk or someone else's work as a free sample.
      </p>

      <Input
        className="mt-6 max-w-sm"
        placeholder="Search by name or school…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search students"
      />

      {students.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading dashboard…</p>
      ) : rows.length === 0 ? (
        <p className="paper-card mt-6 p-6 text-sm text-muted-foreground">No students found yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-secondary/40 text-left"><tr>
              <th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Previous month</th><th className="px-4 py-3 text-right">Current month</th>
              <th className="px-4 py-3 text-right">All time</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>{rows.map((row) => {
              const verified = verifiedIds.has(row.id) || adminIds.has(row.id);
              const suspended = Boolean(row.suspended_at);
              return <tr key={row.id} className="border-t">
                <td className="px-4 py-4"><div className="font-medium">{row.display_name}</div><div className="text-xs text-muted-foreground">{row.school ?? "No school set"}</div></td>
                <td className="px-4 py-4">{adminIds.has(row.id) ? <Badge variant="outline">Protected admin</Badge> : suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="secondary">Active</Badge>}</td>
                <td className="px-4 py-4 text-right">{money(row.earnings.previousMonth)}</td>
                <td className="px-4 py-4 text-right">{money(row.earnings.currentMonth)}</td>
                <td className="px-4 py-4 text-right font-semibold">{money(row.earnings.allTime)}</td>
                <td className="px-4 py-4 text-right">{row.earnings.salesCount}</td>
                <td className="px-4 py-4"><div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setTopStudent.mutate({userId: row.id, top: !row.is_top_student})} disabled={adminIds.has(row.id)}>{row.is_top_student ? "Remove top student" : "Mark top student"}</Button>
                  <Button size="sm" variant={verified ? "ghost" : "default"} disabled={adminIds.has(row.id) || setVerified.isPending} onClick={() => setVerified.mutate({userId: row.id, verified: !verifiedIds.has(row.id)})}>{verifiedIds.has(row.id) ? "Unverify" : "Verify"}</Button>
                  {!adminIds.has(row.id) && <Button size="sm" variant={suspended ? "default" : "destructive"} disabled={suspension.isPending} onClick={() => suspension.mutate({userId: row.id, suspended: !suspended})}><UserRoundX className="mr-1 h-4 w-4" />{suspended ? "Unsuspend" : "Suspend"}</Button>}
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
