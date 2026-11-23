-- WAVE portal, phase 1: accounts, clients, membership, settings, activity log.
-- Every table has row-level security. Clients only ever see rows of the business
-- they belong to; the admin sees everything, but only from a session that passed
-- two-step verification (aal2).

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '' check (length(full_name) <= 120),
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(trim(business_name)) between 1 and 120),
  contact_name text not null default '' check (length(contact_name) <= 120),
  contact_email text not null default '' check (length(contact_email) <= 200),
  contact_phone text not null default '' check (length(contact_phone) <= 40),
  plan text not null default '' check (length(plan) <= 80),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly', 'one_time', 'none')),
  monthly_amount numeric(10, 2) not null default 0 check (monthly_amount >= 0),
  status text not null default 'active' check (status in ('lead', 'active', 'paused', 'cancelled')),
  billing_status text not null default 'current' check (billing_status in ('current', 'overdue')),
  next_payment_date date,
  start_date date default current_date,
  website_url text not null default '' check (length(website_url) <= 300),
  domain text not null default '' check (length(domain) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin-only fields live in their own table so row-level security can hide them completely.
create table public.client_private (
  client_id uuid primary key references public.clients (id) on delete cascade,
  notes text not null default '' check (length(notes) <= 20000),
  stripe_customer_id text not null default '' check (length(stripe_customer_id) <= 100),
  cloudflare_site_tag text not null default '' check (length(cloudflare_site_tag) <= 100),
  updated_at timestamptz not null default now()
);

create table public.client_members (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);
create index client_members_user_idx on public.client_members (user_id);

-- Settings every signed-in user may read (booking link, billing link, support address).
create table public.app_settings (
  id boolean primary key default true check (id),
  calendly_url text not null default 'https://calendly.com/anzum2225/wave' check (length(calendly_url) <= 300),
  stripe_portal_url text not null default '' check (length(stripe_portal_url) <= 300),
  support_email text not null default 'clientsupport@wavedigital.biz' check (length(support_email) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- Settings only the admin may read or change.
create table public.admin_settings (
  id boolean primary key default true check (id),
  admin_notify_email text not null default '' check (length(admin_notify_email) <= 200),
  summary_send_delay_days int not null default 2 check (summary_send_delay_days between 0 and 14),
  updated_at timestamptz not null default now()
);
insert into public.admin_settings default values;

create table public.activity_log (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_client_idx on public.activity_log (client_id, created_at desc);

-- ---------- helpers (private schema: not reachable through the API) ----------

-- Admin rights need the admin role AND a session that passed two-step verification.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function private.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_members m where m.client_id = cid and m.user_id = auth.uid());
$$;

-- True when the signed-in user shares a business with the given user (to show teammates).
create or replace function private.shares_client(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_members a
    join public.client_members b on b.client_id = a.client_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

create or replace function private.log(p_client uuid, p_action text, p_entity text, p_entity_id text, p_summary text)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_log (client_id, actor_id, action, entity, entity_id, summary)
  values (p_client, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_summary, ''));
$$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on all functions in schema private from public;
grant execute on function private.is_admin(), private.is_member(uuid), private.shares_client(uuid) to authenticated;

-- ---------- triggers ----------

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.handle_user_email_change();

create trigger clients_touch before update on public.clients for each row execute function private.touch_updated_at();
create trigger client_private_touch before update on public.client_private for each row execute function private.touch_updated_at();
create trigger app_settings_touch before update on public.app_settings for each row execute function private.touch_updated_at();
create trigger admin_settings_touch before update on public.admin_settings for each row execute function private.touch_updated_at();

-- Every new client gets its private row, so the admin form can always update it.
create or replace function private.client_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_private (client_id) values (new.id) on conflict do nothing;
  perform private.log(new.id, 'client_added', 'client', new.id::text, 'Client added: ' || new.business_name);
  return new;
end $$;
create trigger clients_created after insert on public.clients for each row execute function private.client_created();

create or replace function private.client_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.log(new.id, 'client_status', 'client', new.id::text, 'Status changed to ' || new.status);
  end if;
  if new.plan is distinct from old.plan or new.monthly_amount is distinct from old.monthly_amount then
    perform private.log(new.id, 'client_plan', 'client', new.id::text,
      'Plan set to ' || coalesce(nullif(new.plan, ''), 'none') || ' at $' || new.monthly_amount::text);
  end if;
  return new;
end $$;
create trigger clients_changed after update on public.clients for each row execute function private.client_changed();

create or replace function private.member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if tg_op = 'INSERT' then
    select email into v_email from public.profiles where id = new.user_id;
    perform private.log(new.client_id, 'member_added', 'member', new.user_id::text, 'Portal access given to ' || coalesce(v_email, 'a user'));
    return new;
  else
    select email into v_email from public.profiles where id = old.user_id;
    perform private.log(old.client_id, 'member_removed', 'member', old.user_id::text, 'Portal access removed for ' || coalesce(v_email, 'a user'));
    return old;
  end if;
end $$;
create trigger client_members_changed after insert or delete on public.client_members
  for each row execute function private.member_changed();

-- ---------- row-level security ----------

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_private enable row level security;
alter table public.client_members enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_settings enable row level security;
alter table public.activity_log enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()) or private.shares_client(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy clients_select on public.clients for select to authenticated
  using ((select private.is_admin()) or private.is_member(id));
create policy clients_admin_insert on public.clients for insert to authenticated with check ((select private.is_admin()));
create policy clients_admin_update on public.clients for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy clients_admin_delete on public.clients for delete to authenticated using ((select private.is_admin()));

create policy client_private_admin on public.client_private for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy client_members_select on public.client_members for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()) or private.is_member(client_id));
create policy client_members_admin_insert on public.client_members for insert to authenticated with check ((select private.is_admin()));
create policy client_members_admin_update on public.client_members for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy client_members_admin_delete on public.client_members for delete to authenticated using ((select private.is_admin()));

create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_settings_admin on public.admin_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy activity_admin_select on public.activity_log for select to authenticated using ((select private.is_admin()));

-- ---------- grants: nothing for signed-out visitors; profiles only let users change their own name ----------

revoke all on public.profiles, public.clients, public.client_private, public.client_members,
  public.app_settings, public.admin_settings, public.activity_log from anon;
revoke insert, delete on public.admin_settings from authenticated;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke insert, update, delete on public.activity_log from authenticated;
revoke insert, delete on public.app_settings from authenticated;

-- ---------- boot call for the portal app ----------

-- One round trip on sign-in: who am I, and which businesses can I see.
create or replace function public.portal_context() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'business_name', c.business_name, 'member_role', m.role) order by c.business_name)
      from public.client_members m join public.clients c on c.id = m.client_id
      where m.user_id = auth.uid()), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.app_settings s)
  );
$$;
revoke all on function public.portal_context() from public, anon;
grant execute on function public.portal_context() to authenticated;
