-- WAVE portal, phase 4: website stats (from Cloudflare Web Analytics), monthly social/ads/review
-- numbers, and monthly summaries emailed to clients.

create table public.site_stats_daily (
  client_id uuid not null references public.clients (id) on delete cascade,
  day date not null,
  visits int not null default 0 check (visits >= 0),
  pageviews int not null default 0 check (pageviews >= 0),
  primary key (client_id, day)
);

-- Top pages, sources, countries and devices per day.
create table public.site_stats_dims (
  client_id uuid not null references public.clients (id) on delete cascade,
  day date not null,
  dim text not null check (dim in ('page', 'referrer', 'country', 'device')),
  label text not null check (length(label) <= 300),
  pageviews int not null default 0 check (pageviews >= 0),
  visits int not null default 0 check (visits >= 0),
  primary key (client_id, day, dim, label)
);

-- One value per client, month and metric (e.g. social.instagram.followers, ads.leads).
create table public.monthly_metrics (
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  metric text not null check (metric ~ '^[a-z]+(\.[a-z_]+){1,2}$'),
  value numeric(14, 2) not null,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, month, metric)
);

create table public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status text not null default 'draft' check (status in ('draft', 'sent', 'skipped')),
  admin_note text not null default '' check (length(admin_note) <= 4000),
  pdf_path text,
  send_after timestamptz,
  generated_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
create trigger monthly_summaries_touch before update on public.monthly_summaries for each row execute function private.touch_updated_at();

create or replace function private.metrics_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger monthly_metrics_stamp before insert or update on public.monthly_metrics
  for each row execute function private.metrics_stamp();

-- ---------- row-level security ----------
alter table public.site_stats_daily enable row level security;
alter table public.site_stats_dims enable row level security;
alter table public.monthly_metrics enable row level security;
alter table public.monthly_summaries enable row level security;

create policy site_stats_daily_select on public.site_stats_daily for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy site_stats_dims_select on public.site_stats_dims for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));

create policy monthly_metrics_select on public.monthly_metrics for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy monthly_metrics_admin_write on public.monthly_metrics for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy monthly_summaries_select on public.monthly_summaries for select to authenticated
  using ((select private.is_admin()) or (status = 'sent' and private.is_member(client_id)));
create policy monthly_summaries_admin_write on public.monthly_summaries for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.site_stats_daily, public.site_stats_dims, public.monthly_metrics, public.monthly_summaries from anon;
grant select on public.site_stats_daily, public.site_stats_dims to authenticated;
grant select, insert, update, delete on public.monthly_metrics, public.monthly_summaries to authenticated;
grant select, insert, update, delete on public.site_stats_daily, public.site_stats_dims, public.monthly_metrics, public.monthly_summaries to service_role;

-- Clients may open a summary PDF only once it has been sent to them.
drop policy client_files_read on storage.objects;
create policy client_files_read on storage.objects for select to authenticated
  using (bucket_id = 'client-files'
         and ((select private.is_admin())
              or (private.is_member(private.folder_client(name))
                  and (split_part(name, '/', 2) <> 'summaries'
                       or exists (select 1 from public.monthly_summaries s
                                  where s.pdf_path = name and s.status = 'sent')))));

-- ---------- schedules ----------
-- Calls an edge function from the database with the shared secret.
create or replace function private.call_function(p_name text, p_body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'wave_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'wave_function_secret';
  perform net.http_post(
    url := v_url || '/' || p_name,
    body := p_body,
    headers := jsonb_build_object('content-type', 'application/json', 'x-wave-secret', v_secret),
    timeout_milliseconds := 120000
  );
end $$;

-- Website stats every night; summaries drafted on the 1st; due summaries sent every day.
select cron.schedule('wave-sync-site-stats', '17 6 * * *', $$select private.call_function('sync-site-stats', '{"action":"sync_all"}'::jsonb)$$);
select cron.schedule('wave-summaries-generate', '7 8 1 * *', $$select private.call_function('monthly-summary', '{"action":"generate_all"}'::jsonb)$$);
select cron.schedule('wave-summaries-send', '37 15 * * *', $$select private.call_function('monthly-summary', '{"action":"send_due"}'::jsonb)$$);
