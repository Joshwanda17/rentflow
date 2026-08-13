CREATE OR REPLACE FUNCTION public.ops_tps_report_authorized()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT current_user IN ('service_role','postgres','supabase_admin')
    OR public.is_ops_role(auth.uid())
    OR public.has_role(auth.uid(), 'tenant_ops')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'cto')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'coo')
    OR public.has_role(auth.uid(), 'cfo');
$$;

REVOKE ALL ON FUNCTION public.ops_tps_report_authorized() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ops_tps_report_authorized() TO authenticated, service_role;