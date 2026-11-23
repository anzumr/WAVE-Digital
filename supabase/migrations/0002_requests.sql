-- WAVE portal, phase 2: requests, request updates, files (attachments for now) and email notifications.

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  ref_no bigint generated always as identity unique,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  type text not null check (type in ('website', 'social', 'advertising', 'branding', 'broken', 'other')),
  title text not null check (length(trim(title)) between 1 and 140),
  details text not null check (length(trim(details)) between 1 and 5000),
  page_url text not null default '' check (length(page_url) <= 500),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  wanted_by date,
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting_on_client', 'done', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index requests_client_idx on public.requests (client_id, created_at desc);
create index requests_status_idx on public.requests (status, created_at desc);

create table public.request_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('status', 'admin_note', 'client_note')),
  from_status text,
  to_status text,
  message text not null default '' check (length(message) <= 5000),
  created_at timestamptz not null default now()
);
create index request_updates_request_idx on public.request_updates (request_id, created_at);

-- Files are stored in the private "client-files" bucket under {client_id}/{category}/...
create table public.files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  bucket_path text not null unique check (length(bucket_path) <= 500),
  file_name text not null check (length(file_name) between 1 and 200),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  mime_type text not null default '' check (length(mime_type) <= 120),
  category text not null check (category in ('deliverable', 'upload', 'request')),
  request_id uuid references public.requests (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((category = 'request') = (request_id is not null))
);
create index files_client_idx on public.files (client_id, created_at desc);
create index files_request_idx on public.files (request_id);

create trigger requests_touch before update on public.requests for each row execute function private.touch_updated_at();

-- ---------- request rules ----------

-- A client's new request always starts as "new" and is attributed to them.
create or replace function private.request_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  if not private.is_admin() then
    new.status := 'new';
    new.closed_at := null;
  end if;
  new.title := trim(new.title);
  return new;
end $$;
create trigger requests_before_insert before insert on public.requests
  for each row execute function private.request_before_insert();

create or replace function private.request_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.log(new.client_id, 'request_created', 'request', new.id::text,
    'Request #' || new.ref_no || ' created: ' || new.title);
  return new;
end $$;
create trigger requests_after_insert after insert on public.requests
  for each row execute function private.request_after_insert();

-- Updates take their client from the request, so nobody can attach a note to another business.
create or replace function private.request_update_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_status text;
begin
  select client_id, status into v_client, v_status from public.requests where id = new.request_id;
  if v_client is null then
    raise exception 'request not found';
  end if;
  new.client_id := v_client;
  new.author_id := coalesce(auth.uid(), new.author_id);
  if not private.is_admin() and auth.uid() is not null then
    if new.kind <> 'client_note' then
      raise exception 'clients can only add details to a request';
    end if;
    if v_status in ('done', 'declined') then
      raise exception 'this request is closed';
    end if;
    new.from_status := null;
    new.to_status := null;
  end if;
  return new;
end $$;
create trigger request_updates_before_insert before insert on public.request_updates
  for each row execute function private.request_update_before_insert();

-- Admin: change a request's status (and optionally add a message the client will see) in one step.
create or replace function public.set_request_status(p_request uuid, p_status text, p_message text default '')
returns public.requests
language plpgsql security definer set search_path = '' as $$
declare v_req public.requests; v_old text;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('new', 'in_progress', 'waiting_on_client', 'done', 'declined') then
    raise exception 'unknown status %', p_status;
  end if;
  select * into v_req from public.requests where id = p_request for update;
  if v_req.id is null then
    raise exception 'request not found';
  end if;
  if v_req.status = p_status then
    if coalesce(trim(p_message), '') <> '' then
      insert into public.request_updates (request_id, kind, message) values (p_request, 'admin_note', trim(p_message));
    end if;
    return v_req;
  end if;
  v_old := v_req.status;
  update public.requests
     set status = p_status,
         closed_at = case when p_status in ('done', 'declined') then now() else null end
   where id = p_request
  returning * into v_req;
  insert into public.request_updates (request_id, kind, from_status, to_status, message)
  values (p_request, 'status', v_old, p_status, coalesce(trim(p_message), ''));
  perform private.log(v_req.client_id, 'request_status', 'request', v_req.id::text,
    'Request #' || v_req.ref_no || ' marked ' || replace(p_status, '_', ' '));
  return v_req;
end $$;
revoke all on function public.set_request_status(uuid, text, text) from public, anon;
grant execute on function public.set_request_status(uuid, text, text) to authenticated;

-- ---------- files ----------

create or replace function private.folder_client(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;
grant execute on function private.folder_client(text) to authenticated;

create or replace function private.file_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  if private.folder_client(new.bucket_path) is distinct from new.client_id then
    raise exception 'file path does not match the client';
  end if;
  if new.request_id is not null then
    select client_id into v_client from public.requests where id = new.request_id;
    if v_client is distinct from new.client_id then
      raise exception 'request belongs to another client';
    end if;
    if (select count(*) from public.files where request_id = new.request_id) >= 5 then
      raise exception 'a request can have at most 5 attachments';
    end if;
  end if;
  if not private.is_admin() and new.category = 'deliverable' then
    raise exception 'only WAVE can add deliverables';
  end if;
  return new;
end $$;
create trigger files_before_insert before insert on public.files
  for each row execute function private.file_before_insert();

insert into storage.buckets (id, name, public, file_size_limit)
values ('client-files', 'client-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy client_files_read on storage.objects for select to authenticated
  using (bucket_id = 'client-files'
         and ((select private.is_admin()) or private.is_member(private.folder_client(name))));
create policy client_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files'
              and ((select private.is_admin())
                   or (private.is_member(private.folder_client(name))
                       and split_part(name, '/', 2) in ('upload', 'request'))));
create policy client_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'client-files'
         and ((select private.is_admin())
              or (owner_id = (select auth.uid())::text and split_part(name, '/', 2) = 'upload')));

-- ---------- row-level security ----------

alter table public.requests enable row level security;
alter table public.request_updates enable row level security;
alter table public.files enable row level security;

create policy requests_select on public.requests for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy requests_insert on public.requests for insert to authenticated
  with check ((select private.is_admin()) or private.is_member(client_id));
create policy requests_admin_update on public.requests for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy requests_admin_delete on public.requests for delete to authenticated using ((select private.is_admin()));

create policy request_updates_select on public.request_updates for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy request_updates_insert on public.request_updates for insert to authenticated
  with check ((select private.is_admin())
              or (kind = 'client_note' and private.is_member(client_id)));

create policy files_select on public.files for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy files_insert on public.files for insert to authenticated
  with check ((select private.is_admin())
              or (private.is_member(client_id) and category in ('upload', 'request')));
create policy files_delete on public.files for delete to authenticated
  using ((select private.is_admin())
         or (uploaded_by = (select auth.uid()) and category = 'upload'));

revoke all on public.requests, public.request_updates, public.files from anon;
revoke update, delete on public.request_updates from authenticated;
revoke update on public.files from authenticated;

-- ---------- email notifications (database -> "notify" edge function) ----------

-- Calls never block the user's action: failures are swallowed and only logged by Postgres.
create or replace function private.notify(p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'wave_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'wave_function_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/notify',
    body := jsonb_build_object('event', p_event, 'data', p_payload),
    headers := jsonb_build_object('content-type', 'application/json', 'x-wave-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'notify(%) failed: %', p_event, sqlerrm;
end $$;

create or replace function private.request_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('request_created', jsonb_build_object('request_id', new.id));
  return new;
end $$;
create trigger requests_notify after insert on public.requests
  for each row execute function private.request_notify();

create or replace function private.request_update_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('request_update', jsonb_build_object('update_id', new.id, 'request_id', new.request_id, 'kind', new.kind));
  return new;
end $$;
create trigger request_updates_notify after insert on public.request_updates
  for each row execute function private.request_update_notify();
