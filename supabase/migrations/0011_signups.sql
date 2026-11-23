-- WAVE portal: public sign-up. People sign up either as an existing client (WAVE approves and links
-- them to their business) or as a prospect (they become a lead with their own portal once their email
-- is confirmed). Accounts are created by the "signup" edge function, never by the open auth endpoint.

create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('existing', 'prospect')),
  business_name text not null check (length(trim(business_name)) between 1 and 120),
  phone text not null default '' check (length(phone) <= 40),
  service text not null default '' check (length(service) <= 40),
  details text not null default '' check (length(details) <= 5000),
  status text not null default 'unconfirmed' check (status in ('unconfirmed', 'pending', 'approved', 'converted', 'declined')),
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index signup_requests_status_idx on public.signup_requests (status, created_at desc);

alter table public.signup_requests enable row level security;
create policy signup_requests_select on public.signup_requests for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));
create policy signup_requests_admin_update on public.signup_requests for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.signup_requests from anon;
grant select, update on public.signup_requests to authenticated;
grant select, insert, update, delete on public.signup_requests to service_role;

-- The boot call also tells a signed-up person where their request stands, and each business's status.
create or replace function public.portal_context() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'business_name', c.business_name, 'member_role', m.role, 'status', c.status) order by c.business_name)
      from public.client_members m join public.clients c on c.id = m.client_id
      where m.user_id = auth.uid()), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.app_settings s),
    'signup', (select jsonb_build_object('kind', r.kind, 'status', r.status, 'business_name', r.business_name)
               from public.signup_requests r where r.user_id = auth.uid())
  );
$$;
revoke all on function public.portal_context() from public, anon;
grant execute on function public.portal_context() to authenticated;
