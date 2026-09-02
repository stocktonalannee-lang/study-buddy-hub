-- Admin note preservation and secure moderation access.
-- Archived listings stay in storage and can be relisted later without creating a new sale history.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_archived_idx ON public.listings (archived_at);

-- Sales are created through the server-side recordSale function. Do not allow clients
-- to insert/update the ledger directly, since that would bypass its validation.
REVOKE INSERT, UPDATE, DELETE ON public.sales FROM authenticated;

-- Keep paid note files protected. Admins receive short-lived signed URLs from a
-- server-side function rather than direct public URLs.
-- The existing "notes" storage bucket is intentionally left private.
