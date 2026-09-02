ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_admin_read" ON public.sales;
CREATE POLICY "sales_admin_read" ON public.sales FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.record_listing_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_sold = true AND OLD.is_sold = false AND NEW.is_free = false THEN
    NEW.sold_at := COALESCE(NEW.sold_at, now());
    INSERT INTO public.sales (listing_id, seller_id, amount_cents, sold_at)
    VALUES (NEW.id, NEW.seller_id, NEW.price_cents, NEW.sold_at)
    ON CONFLICT (listing_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_record_sale ON public.listings;
CREATE TRIGGER listings_record_sale BEFORE UPDATE OF is_sold ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.record_listing_sale();

CREATE INDEX IF NOT EXISTS sales_seller_sold_at_idx ON public.sales (seller_id, sold_at);
CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON public.sales (sold_at);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS profiles_suspended_idx ON public.profiles (suspended_at) WHERE suspended_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_suspended(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND suspended_at IS NOT NULL);
$$;

REVOKE EXECUTE ON FUNCTION public.is_suspended(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_suspended(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "listings_insert_own" ON public.listings;
CREATE POLICY "listings_insert_own" ON public.listings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = seller_id AND NOT public.is_suspended(auth.uid()) AND
  (is_free = false OR public.has_role(auth.uid(), 'verified_sharer') OR public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "listings_update_own" ON public.listings;
CREATE POLICY "listings_update_own" ON public.listings FOR UPDATE TO authenticated
USING ((auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin')) AND NOT public.is_suspended(auth.uid()))
WITH CHECK ((auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin')) AND NOT public.is_suspended(auth.uid()) AND
  (is_free = false OR public.has_role(auth.uid(), 'verified_sharer') OR public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "listings_delete_own" ON public.listings;
CREATE POLICY "listings_delete_own" ON public.listings FOR DELETE TO authenticated
USING (auth.uid() = seller_id AND NOT public.is_suspended(auth.uid()));

DROP POLICY IF EXISTS "threads_buyer_insert" ON public.threads;
CREATE POLICY "threads_buyer_insert" ON public.threads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = buyer_id AND buyer_id <> seller_id AND NOT public.is_suspended(auth.uid()));

DROP POLICY IF EXISTS "threads_participant_update" ON public.threads;
CREATE POLICY "threads_participant_update" ON public.threads FOR UPDATE TO authenticated
USING ((auth.uid() = buyer_id OR auth.uid() = seller_id) AND NOT public.is_suspended(auth.uid()))
WITH CHECK ((auth.uid() = buyer_id OR auth.uid() = seller_id) AND NOT public.is_suspended(auth.uid()));

DROP POLICY IF EXISTS "messages_participant_insert" ON public.messages;
CREATE POLICY "messages_participant_insert" ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND NOT public.is_suspended(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.threads t WHERE t.id = thread_id AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
));