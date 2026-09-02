CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = internal, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION internal.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.has_role(UUID, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR internal.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_insert" ON public.user_roles;
CREATE POLICY "user_roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (internal.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_delete" ON public.user_roles;
CREATE POLICY "user_roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (internal.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "listings_insert_own" ON public.listings;
CREATE POLICY "listings_insert_own" ON public.listings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND (
      is_free = false
      OR internal.has_role(auth.uid(), 'verified_sharer')
      OR internal.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "listings_update_own" ON public.listings;
CREATE POLICY "listings_update_own" ON public.listings
  FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id OR internal.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    (auth.uid() = seller_id OR internal.has_role(auth.uid(), 'admin'))
    AND (
      is_free = false
      OR internal.has_role(auth.uid(), 'verified_sharer')
      OR internal.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (internal.has_role(auth.uid(), 'admin'))
  WITH CHECK (internal.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);