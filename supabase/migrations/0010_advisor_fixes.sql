-- Fixes from Supabase's security advisor.

-- set_request_status no longer needs elevated rights: the admin's own row-level security allows the
-- update and the status note, and it still refuses anyone who isn't an admin. Logging moves to a trigger.
create or replace function public.set_request_status(p_request uuid, p_status text, p_message text default '')
returns public.requests
language plpgsql security invoker set search_path = '' as $$
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
  return v_req;
end $$;
revoke all on function public.set_request_status(uuid, text, text) from public, anon;
grant execute on function public.set_request_status(uuid, text, text) to authenticated;

create or replace function private.request_status_logged() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.log(new.client_id, 'request_status', 'request', new.id::text,
      'Request #' || new.ref_no || ' marked ' || replace(new.status, '_', ' '));
  end if;
  return new;
end $$;
drop trigger if exists requests_status_logged on public.requests;
create trigger requests_status_logged after update of status on public.requests
  for each row execute function private.request_status_logged();

-- Keep pg_net out of the public schema (its functions stay in the "net" schema).
drop extension if exists pg_net;
create extension pg_net with schema extensions;
