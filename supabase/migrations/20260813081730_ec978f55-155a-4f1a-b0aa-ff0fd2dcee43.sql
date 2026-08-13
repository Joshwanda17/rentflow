GRANT EXECUTE ON FUNCTION public.ops_tenant_products_services_report(date, date) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.ops_tenant_products_services_rows(date, date, text, text, uuid, text, text, int, int) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.ops_tps_report_authorized() TO supabase_read_only_user;