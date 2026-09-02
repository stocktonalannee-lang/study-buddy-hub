ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.sale_removal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_removal_requests_status_idx ON public.sale_removal_requests(status, created_at);
CREATE INDEX IF NOT EXISTS sale_removal_requests_requester_idx ON public.sale_removal_requests(requester_id, created_at);

ALTER TABLE public.sale_removal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_removal_requests FROM anon;
GRANT SELECT, INSERT ON public.sale_removal_requests TO authenticated;
GRANT UPDATE ON public.sale_removal_requests TO authenticated;
GRANT ALL ON public.sale_removal_requests TO service_role;

DROP POLICY IF EXISTS "sale_removal_requests_insert_own" ON public.sale_removal_requests;
CREATE POLICY "sale_removal_requests_insert_own" ON public.sale_removal_requests
FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "sale_removal_requests_read_own_or_admin" ON public.sale_removal_requests;
CREATE POLICY "sale_removal_requests_read_own_or_admin" ON public.sale_removal_requests
FOR SELECT TO authenticated USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sale_removal_requests_admin_update" ON public.sale_removal_requests;
CREATE POLICY "sale_removal_requests_admin_update" ON public.sale_removal_requests
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sales_admin_read" ON public.sales;
CREATE POLICY "sales_admin_read" ON public.sales
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_id = auth.uid());

DROP POLICY IF EXISTS "sales_seller_no_write" ON public.sales;
CREATE POLICY "sales_seller_no_write" ON public.sales
FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "sales_service_update" ON public.sales;
CREATE POLICY "sales_service_update" ON public.sales
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
