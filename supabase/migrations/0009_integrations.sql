-- WAVE portal, phase 6: connections to clients' Instagram, Facebook, Google Business Profile and Google Ads.
-- WAVE stores which account belongs to which client; the API keys themselves live only in the
-- edge functions' secrets. Synced numbers land in monthly_metrics with source 'auto'.

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook', 'google_business', 'google_ads')),
  external_id text not null default '' check (length(external_id) <= 200),
  account_label text not null default '' check (length(account_label) <= 200),
  enabled boolean not null default true,
  status text not null default 'not_synced' check (status in ('not_synced', 'ok', 'error')),
  last_synced_at timestamptz,
  last_error text not null default '' check (length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider)
);
create trigger integrations_touch before update on public.integrations for each row execute function private.touch_updated_at();

create or replace function private.integration_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.log(new.client_id, 'integration_added', 'integration', new.id::text, 'Connected ' || replace(new.provider, '_', ' '));
  elsif new.status = 'error' and old.status is distinct from 'error' then
    perform private.log(new.client_id, 'integration_error', 'integration', new.id::text, replace(new.provider, '_', ' ') || ' sync failed: ' || left(new.last_error, 200));
  end if;
  return new;
end $$;
create trigger integrations_changed after insert or update on public.integrations
  for each row execute function private.integration_changed();

-- Admin-only (clients see the resulting numbers, not the plumbing).
alter table public.integrations enable row level security;
create policy integrations_admin on public.integrations for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.integrations from anon;
grant select, insert, update, delete on public.integrations to authenticated;
grant select, insert, update, delete on public.integrations to service_role;

-- Pull last month's numbers on the 1st, an hour before the summaries are drafted.
select cron.schedule('wave-sync-integrations', '7 7 1 * *', $$select private.call_function('sync-integrations', '{"action":"sync_all"}'::jsonb)$$);
