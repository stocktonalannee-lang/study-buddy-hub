-- Permanent sale ledger. A listing can be sold any number of times.
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  commission_cents INTEGER NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_seller_sold_at_idx ON public.sales (seller_id, sold_at);
CREATE INDEX IF NOT EXISTS sales_listing_idx ON public.sales (listing_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales FROM anon;
GRANT SELECT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

DROP POLICY IF EXISTS "sales_admin_read" ON public.sales;
CREATE POLICY "sales_admin_read" ON public.sales
FOR SELECT TO authenticated
USING (internal.has_role(auth.uid(), 'admin'));
