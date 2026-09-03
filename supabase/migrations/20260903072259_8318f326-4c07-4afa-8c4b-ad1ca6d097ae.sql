CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0.10,
  commission_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  sold_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_read_own ON public.sales FOR SELECT TO authenticated
  USING (auth.uid() = seller_id OR internal.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY sales_insert_own ON public.sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY sales_update_admin ON public.sales FOR UPDATE TO authenticated
  USING (internal.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (internal.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX sales_seller_idx ON public.sales(seller_id);
CREATE INDEX sales_listing_idx ON public.sales(listing_id);

CREATE TABLE public.sale_removal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sale_removal_requests TO authenticated;
GRANT ALL ON public.sale_removal_requests TO service_role;
ALTER TABLE public.sale_removal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY srr_read ON public.sale_removal_requests FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR internal.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY srr_insert_own ON public.sale_removal_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY srr_update_admin ON public.sale_removal_requests FOR UPDATE TO authenticated
  USING (internal.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (internal.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER srr_updated_at BEFORE UPDATE ON public.sale_removal_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX srr_sale_idx ON public.sale_removal_requests(sale_id);

ALTER TABLE public.listings
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES auth.users(id);