-- Deleting a client cascades to its memberships, whose trigger logs "access removed" against the
-- client being deleted, which the foreign key rejects. Skip log entries for clients that are gone.
create or replace function private.log(p_client uuid, p_action text, p_entity text, p_entity_id text, p_summary text)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_log (client_id, actor_id, action, entity, entity_id, summary)
  select p_client, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_summary, '')
  where p_client is null or exists (select 1 from public.clients c where c.id = p_client);
$$;
revoke all on function private.log(uuid, text, text, text, text) from public;
