-- WAVE portal, phase 3: meetings (booked through Calendly or logged by WAVE).

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  starts_at timestamptz,
  duration_min int not null default 30 check (duration_min between 5 and 480),
  topic text not null default '' check (length(topic) <= 200),
  notes text not null default '' check (length(notes) <= 10000),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'calendly')),
  calendly_event_uri text unique check (length(calendly_event_uri) <= 300),
  meeting_url text not null default '' check (length(meeting_url) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meetings_client_idx on public.meetings (client_id, starts_at desc nulls first);

create trigger meetings_touch before update on public.meetings for each row execute function private.touch_updated_at();

create or replace function private.meeting_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_when text;
begin
  v_when := case when new.starts_at is null then '' else ' for ' || to_char(new.starts_at at time zone 'UTC', 'Mon DD, YYYY HH24:MI') || ' UTC' end;
  if tg_op = 'INSERT' then
    perform private.log(new.client_id, 'meeting_added', 'meeting', new.id::text,
      case when new.source = 'calendly' then 'Meeting booked through Calendly' else 'Meeting logged' end || v_when);
    if new.source = 'calendly' then
      perform private.notify('meeting_booked', jsonb_build_object('meeting_id', new.id));
    end if;
  elsif new.status is distinct from old.status then
    perform private.log(new.client_id, 'meeting_status', 'meeting', new.id::text, 'Meeting marked ' || new.status || v_when);
  end if;
  return new;
end $$;
create trigger meetings_changed after insert or update on public.meetings
  for each row execute function private.meeting_changed();

alter table public.meetings enable row level security;
create policy meetings_select on public.meetings for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy meetings_admin_insert on public.meetings for insert to authenticated with check ((select private.is_admin()));
create policy meetings_admin_update on public.meetings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy meetings_admin_delete on public.meetings for delete to authenticated using ((select private.is_admin()));

revoke all on public.meetings from anon;
grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meetings to service_role;

-- Payment status changes show up in the activity log too.
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
  if new.billing_status is distinct from old.billing_status then
    perform private.log(new.id, 'billing_status', 'client', new.id::text,
      case when new.billing_status = 'overdue' then 'Payment marked overdue' else 'Payment marked as paid' end);
  elsif new.next_payment_date is distinct from old.next_payment_date and new.next_payment_date is not null then
    perform private.log(new.id, 'billing_date', 'client', new.id::text, 'Next payment date set to ' || to_char(new.next_payment_date, 'Mon DD, YYYY'));
  end if;
  return new;
end $$;
