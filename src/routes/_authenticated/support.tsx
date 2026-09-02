import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getSupportSales, createSaleRemovalRequest } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — NoteSwap" }, { name: "robots", content: "noindex" }] }),
  component: SupportPage,
});

function SupportPage() {
  const queryClient = useQueryClient();
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const sales = useQuery({ queryKey: ["support-sales"], queryFn: () => getSupportSales() });
  const submit = useMutation({
    mutationFn: () => createSaleRemovalRequest({ data: { saleId, reason } }),
    onSuccess: () => {
      toast.success("Request sent to the admins");
      setSaleId(""); setReason("");
      queryClient.invalidateQueries({ queryKey: ["support-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return <div className="mx-auto max-w-3xl px-4 py-10">
    <div className="flex items-center gap-3"><HelpCircle className="h-6 w-6 text-accent" /><h1 className="text-3xl font-semibold">Support</h1></div>
    <p className="mt-2 text-sm text-muted-foreground">Need a sale corrected? Select the sale and explain why it should be removed. An admin reviews every request.</p>

    <div className="paper-card mt-6 p-6">
      <h2 className="text-xl font-semibold">Request a sale removal</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sales are not silently deleted. If approved, the transaction is marked voided so there is an audit trail and it no longer counts toward earnings.</p>
      <div className="mt-5 space-y-4">
        <div className="space-y-1.5"><Label htmlFor="sale">Sale</Label>
          <select id="sale" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={saleId} onChange={e => setSaleId(e.target.value)}>
            <option value="">Select a sale…</option>
            {(sales.data ?? []).map((sale: any) => <option key={sale.id} value={sale.id}>{new Date(sale.sold_at).toLocaleString()} — {formatCurrency(sale.amount_cents)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="reason">Why should this sale be removed?</Label><Textarea id="reason" minLength={5} maxLength={1000} rows={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain what happened and why the sale was recorded incorrectly." /></div>
        <Button disabled={!saleId || reason.trim().length < 5 || submit.isPending} onClick={() => submit.mutate()}>Send request</Button>
      </div>
    </div>

    <div className="paper-card mt-6 p-6">
      <h2 className="text-xl font-semibold">How commissions work</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Each completed sale is recorded as its own transaction using the listing price at the time the seller records the sale. The transaction keeps its timestamp and seller. Commission is calculated from the recorded sale amount using the site's configured commission rate rather than changing the listing price. The seller's net amount is the sale amount minus the commission, and the platform's commission is tracked separately. A sale-removal request does not erase the transaction; an approved request voids it and removes it from active earnings and commission calculations.</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">This means one listing can be sold repeatedly, each sale is counted once, and corrections require admin review.</p>
      <Badge variant="secondary" className="mt-4">Commission rate is controlled by the site configuration</Badge>
    </div>
  </div>;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
