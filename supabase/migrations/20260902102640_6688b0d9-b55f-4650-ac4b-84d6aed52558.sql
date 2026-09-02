CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_any_admin() THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'admin');

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_any_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated, service_role;