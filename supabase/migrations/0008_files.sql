-- WAVE portal, phase 5: shared files (deliverables and client uploads) and requested-file checklists.

create table public.file_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 140),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'open' check (status in ('open', 'received', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  received_at timestamptz
);
create index file_requests_client_idx on public.file_requests (client_id, created_at desc);

alter table public.files add column file_request_id uuid references public.file_requests (id) on delete set null;
alter table public.files add column note text not null default '' check (length(note) <= 500);
create index files_file_request_idx on public.files (file_request_id);

-- Checks on every new file row: right folder, right client, right kind for the uploader.
create or replace function private.file_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_status text;
begin
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  if private.folder_client(new.bucket_path) is distinct from new.client_id then
    raise exception 'file path does not match the client';
  end if;
  if split_part(new.bucket_path, '/', 2) <> new.category then
    raise exception 'file path does not match its kind';
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
  if new.file_request_id is not null then
    select client_id, status into v_client, v_status from public.file_requests where id = new.file_request_id;
    if v_client is distinct from new.client_id then
      raise exception 'that file request belongs to another client';
    end if;
    if new.category <> 'upload' then
      raise exception 'only uploads can answer a file request';
    end if;
  end if;
  if not private.is_admin() and new.category = 'deliverable' then
    raise exception 'only WAVE can add deliverables';
  end if;
  return new;
end $$;

-- Uploading against a requested file ticks it off; new files are logged and emailed.
create or replace function private.file_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.file_request_id is not null then
    update public.file_requests set status = 'received', received_at = now()
     where id = new.file_request_id and status = 'open';
  end if;
  if new.category in ('upload', 'deliverable') then
    perform private.log(new.client_id, 'file_' || new.category, 'file', new.id::text,
      case when new.category = 'deliverable' then 'WAVE shared ' else 'Client uploaded ' end || new.file_name);
    perform private.notify('file_added', jsonb_build_object('file_id', new.id));
  end if;
  return new;
end $$;
create trigger files_after_insert after insert on public.files
  for each row execute function private.file_after_insert();

create or replace function private.file_request_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.log(new.client_id, 'file_requested', 'file_request', new.id::text, 'WAVE asked for: ' || new.title);
    perform private.notify('file_requested', jsonb_build_object('file_request_id', new.id));
  elsif new.status is distinct from old.status then
    perform private.log(new.client_id, 'file_request_' || new.status, 'file_request', new.id::text,
      case new.status when 'received' then 'Received: ' when 'cancelled' then 'No longer needed: ' else 'Asked again for: ' end || new.title);
  end if;
  return new;
end $$;
create trigger file_requests_changed after insert or update on public.file_requests
  for each row execute function private.file_request_changed();

alter table public.file_requests enable row level security;
create policy file_requests_select on public.file_requests for select to authenticated
  using ((select private.is_admin()) or private.is_member(client_id));
create policy file_requests_admin_write on public.file_requests for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.file_requests from anon;
grant select, insert, update, delete on public.file_requests to authenticated;
grant select, insert, update, delete on public.file_requests to service_role;
-- Admin can edit a file's note; nothing else on a file row changes after upload.
grant update (note) on public.files to authenticated;
create policy files_admin_update on public.files for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
