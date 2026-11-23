-- New Supabase projects give API roles no table access by default. Grant exactly what the portal
-- uses; row-level security still decides which rows each person can touch.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

grant select, insert, update, delete on public.clients, public.client_private, public.client_members, public.requests to authenticated;
grant select, update on public.app_settings, public.admin_settings to authenticated;
grant select on public.activity_log to authenticated;
grant select, insert on public.request_updates to authenticated;
grant select, insert, delete on public.files to authenticated;
-- profiles: select, plus update of full_name only (granted in 0001).

-- Edge functions use the service role for admin work and background jobs.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
