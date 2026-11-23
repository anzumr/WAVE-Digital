-- Row-level security tests for the WAVE portal.
-- Everything runs in one transaction that is always rolled back: the final RAISE carries the
-- results out as JSON and undoes every fixture. Run with: sql.sh -f supabase/tests/rls_test.sql
do $test$
declare
  admin_id uuid := '00000000-0000-4000-8000-0000000000a1';
  ua uuid := '00000000-0000-4000-8000-0000000000b1';   -- user of client A
  ub uuid := '00000000-0000-4000-8000-0000000000b2';   -- user of client B
  un uuid := '00000000-0000-4000-8000-0000000000b3';   -- user with no business
  ca uuid := '00000000-0000-4000-8000-0000000000c1';
  cb uuid := '00000000-0000-4000-8000-0000000000c2';
  ra uuid := '00000000-0000-4000-8000-0000000000d1';
  rb uuid := '00000000-0000-4000-8000-0000000000d2';
  n int; s text; j jsonb; new_id uuid; frb uuid;
begin
  create temp table results (test text, ok boolean, detail text) on commit drop;
  grant insert, select on results to authenticated, anon;

  -- ---------- fixtures (as the database owner) ----------
  insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at) values
    (admin_id, 'rls-admin@example.com', 'authenticated', 'authenticated', '{"full_name":"RLS Admin"}', now(), now()),
    (ua, 'rls-a@example.com', 'authenticated', 'authenticated', '{"full_name":"Alice A"}', now(), now()),
    (ub, 'rls-b@example.com', 'authenticated', 'authenticated', '{"full_name":"Bob B"}', now(), now()),
    (un, 'rls-n@example.com', 'authenticated', 'authenticated', '{}', now(), now());
  update public.profiles set role = 'admin' where id = admin_id;
  insert into public.clients (id, business_name, plan, monthly_amount) values (ca, 'RLS Alpha', 'Website Creation', 100), (cb, 'RLS Beta', 'Advertising', 150);
  update public.client_private set notes = 'secret A' where client_id = ca;
  insert into public.client_members (client_id, user_id, role) values (ca, ua, 'owner'), (cb, ub, 'owner');
  insert into public.requests (id, client_id, created_by, type, title, details) values
    (ra, ca, ua, 'website', 'A request', 'details A'), (rb, cb, ub, 'social', 'B request', 'details B');
  insert into results values ('fixtures: profile created by trigger', (select count(*) from public.profiles where id in (admin_id, ua, ub, un)) = 4, null);
  insert into results values ('fixtures: client_private created by trigger', (select count(*) from public.client_private where client_id in (ca, cb)) = 2, null);

  -- ---------- client user A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  select count(*) into n from public.clients;
  insert into results values ('A sees only own client', n = 1 and exists (select 1 from public.clients where id = ca), 'saw ' || n);
  select count(*) into n from public.client_private;
  insert into results values ('A cannot see private notes', n = 0, 'saw ' || n);
  select count(*) into n from public.requests;
  insert into results values ('A sees only own requests', n = 1, 'saw ' || n);
  select count(*) into n from public.profiles;
  insert into results values ('A sees only own profile', n = 1, 'saw ' || n);
  select count(*) into n from public.client_members;
  insert into results values ('A sees only own memberships', n = 1, 'saw ' || n);
  select count(*) into n from public.activity_log;
  insert into results values ('A cannot see activity log', n = 0, 'saw ' || n);
  select count(*) into n from public.admin_settings;
  insert into results values ('A cannot see admin settings', n = 0, 'saw ' || n);
  select count(*) into n from public.app_settings;
  insert into results values ('A can read app settings', n = 1, 'saw ' || n);
  j := public.portal_context();
  insert into results values ('A portal_context lists 1 business', jsonb_array_length(j -> 'clients') = 1 and (j -> 'profile' ->> 'role') = 'client', j::text);

  insert into public.requests (client_id, type, title, details, status) values (ca, 'other', 'New one', 'x', 'done') returning id, status into new_id, s;
  insert into results values ('A can create request; status forced to new', s = 'new', s);

  begin
    insert into public.requests (client_id, type, title, details) values (cb, 'other', 'sneaky', 'x');
    insert into results values ('A cannot create request for B', false, 'insert succeeded');
  exception when others then insert into results values ('A cannot create request for B', true, sqlerrm); end;

  update public.requests set status = 'done' where id = ra;
  get diagnostics n = row_count;
  insert into results values ('A cannot update request status directly', n = 0, 'updated ' || n);

  begin
    perform public.set_request_status(ra, 'done', 'x');
    insert into results values ('A cannot call set_request_status', false, 'succeeded');
  exception when others then insert into results values ('A cannot call set_request_status', true, sqlerrm); end;

  insert into public.request_updates (request_id, client_id, kind, message) values (ra, ca, 'client_note', 'more info');
  insert into results values ('A can add details to own request', true, null);

  begin
    insert into public.request_updates (request_id, client_id, kind, message) values (ra, ca, 'admin_note', 'fake WAVE note');
    insert into results values ('A cannot post as WAVE', false, 'succeeded');
  exception when others then insert into results values ('A cannot post as WAVE', true, sqlerrm); end;

  begin
    insert into public.request_updates (request_id, client_id, kind, message) values (rb, ca, 'client_note', 'spoof client id');
    insert into results values ('A cannot add details to B request', false, 'succeeded');
  exception when others then insert into results values ('A cannot add details to B request', true, sqlerrm); end;

  begin
    update public.profiles set role = 'admin' where id = ua;
    insert into results values ('A cannot make self admin', false, 'succeeded');
  exception when others then insert into results values ('A cannot make self admin', true, sqlerrm); end;

  update public.profiles set full_name = 'Alice Renamed' where id = ua;
  get diagnostics n = row_count;
  insert into results values ('A can rename self', n = 1, 'updated ' || n);
  update public.profiles set full_name = 'hacked' where id = ub;
  get diagnostics n = row_count;
  insert into results values ('A cannot rename B', n = 0, 'updated ' || n);

  update public.app_settings set calendly_url = 'https://evil.example' where id;
  get diagnostics n = row_count;
  insert into results values ('A cannot change app settings', n = 0, 'updated ' || n);

  begin
    insert into public.client_members (client_id, user_id) values (cb, ua);
    insert into results values ('A cannot join another business', false, 'succeeded');
  exception when others then insert into results values ('A cannot join another business', true, sqlerrm); end;

  begin
    insert into public.clients (business_name) values ('fake');
    insert into results values ('A cannot create clients', false, 'succeeded');
  exception when others then insert into results values ('A cannot create clients', true, sqlerrm); end;

  insert into public.files (client_id, bucket_path, file_name, category) values (ca, ca || '/upload/a.txt', 'a.txt', 'upload');
  insert into results values ('A can record own upload', true, null);
  begin
    insert into public.files (client_id, bucket_path, file_name, category) values (ca, ca || '/deliverable/x.pdf', 'x.pdf', 'deliverable');
    insert into results values ('A cannot add deliverables', false, 'succeeded');
  exception when others then insert into results values ('A cannot add deliverables', true, sqlerrm); end;
  begin
    insert into public.files (client_id, bucket_path, file_name, category) values (cb, cb || '/upload/b.txt', 'b.txt', 'upload');
    insert into results values ('A cannot record file for B', false, 'succeeded');
  exception when others then insert into results values ('A cannot record file for B', true, sqlerrm); end;
  begin
    insert into public.files (client_id, bucket_path, file_name, category) values (ca, cb || '/upload/c.txt', 'c.txt', 'upload');
    insert into results values ('A cannot point a file at B''s folder', false, 'succeeded');
  exception when others then insert into results values ('A cannot point a file at B''s folder', true, sqlerrm); end;

  reset role;

  -- ---------- user with no business ----------
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients;
  insert into results values ('Unlinked user sees no clients', n = 0, 'saw ' || n);
  select count(*) into n from public.requests;
  insert into results values ('Unlinked user sees no requests', n = 0, 'saw ' || n);
  begin
    insert into public.requests (client_id, type, title, details) values (ca, 'other', 'x', 'x');
    insert into results values ('Unlinked user cannot create requests', false, 'succeeded');
  exception when others then insert into results values ('Unlinked user cannot create requests', true, sqlerrm); end;
  reset role;

  -- ---------- admin without two-step verification ----------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients where id in (ca, cb);
  insert into results values ('Admin at aal1 sees no clients', n = 0, 'saw ' || n);
  begin
    insert into public.clients (business_name) values ('aal1 attempt');
    insert into results values ('Admin at aal1 cannot create clients', false, 'succeeded');
  exception when others then insert into results values ('Admin at aal1 cannot create clients', true, sqlerrm); end;
  reset role;

  -- ---------- admin with two-step verification ----------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients where id in (ca, cb);
  insert into results values ('Admin sees all clients', n = 2, 'saw ' || n);
  select count(*) into n from public.client_private where client_id in (ca, cb);
  insert into results values ('Admin sees private notes', n = 2, 'saw ' || n);
  select count(*) into n from public.requests where client_id in (ca, cb);
  insert into results values ('Admin sees all requests', n >= 3, 'saw ' || n);
  perform public.set_request_status(ra, 'in_progress', 'Working on it');
  select status into s from public.requests where id = ra;
  insert into results values ('Admin can change status', s = 'in_progress', s);
  select from_status || '->' || to_status into s from public.request_updates where request_id = ra and kind = 'status';
  insert into results values ('Status update records from/to', s = 'new->in_progress', s);
  perform public.set_request_status(ra, 'done', '');
  select (closed_at is not null)::text into s from public.requests where id = ra;
  insert into results values ('Done sets closed_at', s = 'true', s);
  select count(*) into n from public.activity_log where client_id = ca;
  insert into results values ('Admin sees activity log', n >= 2, 'saw ' || n);
  insert into public.clients (business_name) values ('RLS Gamma') returning id into new_id;
  insert into results values ('Admin can create clients', new_id is not null, null);
  update public.admin_settings set summary_send_delay_days = 3 where id;
  get diagnostics n = row_count;
  insert into results values ('Admin can change admin settings', n = 1, 'updated ' || n);
  reset role;

  -- ---------- closed requests ----------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into public.request_updates (request_id, client_id, kind, message) values (ra, ca, 'client_note', 'after close');
    insert into results values ('A cannot add to a closed request', false, 'succeeded');
  exception when others then insert into results values ('A cannot add to a closed request', true, sqlerrm); end;
  reset role;

  -- ---------- phases 3-4: meetings, stats, summaries ----------
  insert into public.meetings (client_id, topic, starts_at) values (ca, 'A call', now() + interval '1 day'), (cb, 'B call', now() + interval '1 day');
  insert into public.site_stats_daily (client_id, day, visits, pageviews) values (ca, current_date, 10, 20), (cb, current_date, 5, 9);
  insert into public.site_stats_dims (client_id, day, dim, label, pageviews, visits) values (ca, current_date, 'page', '/', 20, 10), (cb, current_date, 'page', '/', 9, 5);
  insert into public.monthly_metrics (client_id, month, metric, value) values (ca, date_trunc('month', current_date)::date, 'ads.leads', 7), (cb, date_trunc('month', current_date)::date, 'ads.leads', 3);
  insert into public.monthly_summaries (client_id, month, status, pdf_path) values
    (ca, date_trunc('month', current_date - interval '1 month')::date, 'sent', ca || '/summaries/sent.pdf'),
    (ca, date_trunc('month', current_date)::date, 'draft', ca || '/summaries/draft.pdf'),
    (cb, date_trunc('month', current_date - interval '1 month')::date, 'sent', cb || '/summaries/sent.pdf');
  insert into storage.objects (bucket_id, name) values
    ('client-files', ca || '/summaries/sent.pdf'), ('client-files', ca || '/summaries/draft.pdf'),
    ('client-files', ca || '/deliverable/logo.pdf'), ('client-files', cb || '/upload/b.png');

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.meetings;
  insert into results values ('A sees only own meetings', n = 1, 'saw ' || n);
  begin
    insert into public.meetings (client_id, topic) values (ca, 'self-booked');
    insert into results values ('A cannot write meetings directly', false, 'succeeded');
  exception when others then insert into results values ('A cannot write meetings directly', true, sqlerrm); end;
  select count(*) into n from public.site_stats_daily;
  insert into results values ('A sees only own site stats', n = 1, 'saw ' || n);
  select count(*) into n from public.site_stats_dims;
  insert into results values ('A sees only own page stats', n = 1, 'saw ' || n);
  select count(*) into n from public.monthly_metrics;
  insert into results values ('A sees only own monthly numbers', n = 1, 'saw ' || n);
  update public.monthly_metrics set value = 999 where client_id = ca;
  get diagnostics n = row_count;
  insert into results values ('A cannot change monthly numbers', n = 0, 'updated ' || n);
  begin
    insert into public.site_stats_daily (client_id, day, visits) values (ca, current_date - 1, 1000);
    insert into results values ('A cannot write site stats', false, 'succeeded');
  exception when others then insert into results values ('A cannot write site stats', true, sqlerrm); end;
  select count(*) into n from public.monthly_summaries;
  insert into results values ('A sees only own SENT summaries', n = 1, 'saw ' || n);
  select count(*) into n from storage.objects where bucket_id = 'client-files';
  insert into results values ('A storage: sees own sent summary + deliverable only', n = 2, 'saw ' || n);
  select count(*) into n from storage.objects where name = ca || '/summaries/draft.pdf';
  insert into results values ('A cannot open draft summary PDF', n = 0, 'saw ' || n);
  select count(*) into n from storage.objects where name like cb || '/%';
  insert into results values ('A cannot see B files in storage', n = 0, 'saw ' || n);
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('client-files', ca || '/deliverable/fake.pdf', ua::text);
    insert into results values ('A cannot upload into deliverables folder', false, 'succeeded');
  exception when others then insert into results values ('A cannot upload into deliverables folder', true, sqlerrm); end;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('client-files', cb || '/upload/x.png', ua::text);
    insert into results values ('A cannot upload into B folder', false, 'succeeded');
  exception when others then insert into results values ('A cannot upload into B folder', true, sqlerrm); end;
  insert into storage.objects (bucket_id, name, owner_id) values ('client-files', ca || '/upload/mine.png', ua::text);
  insert into results values ('A can upload into own uploads folder', true, null);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from public.monthly_summaries where client_id in (ca, cb);
  insert into results values ('Admin sees all summaries incl. drafts', n = 3, 'saw ' || n);
  insert into public.monthly_metrics (client_id, month, metric, value) values (ca, date_trunc('month', current_date)::date, 'reviews.google.rating', 4.7);
  insert into results values ('Admin can enter monthly numbers', true, null);
  begin
    insert into public.monthly_metrics (client_id, month, metric, value) values (ca, current_date, 'bad metric!', 1);
    insert into results values ('Bad metric key rejected', current_date = date_trunc('month', current_date)::date and false, 'succeeded');
  exception when others then insert into results values ('Bad metric key rejected', true, sqlerrm); end;
  insert into public.meetings (client_id, topic) values (cb, 'Logged by WAVE');
  insert into results values ('Admin can log meetings', true, null);
  update public.clients set billing_status = 'overdue' where id = ca;
  select count(*) into n from public.activity_log where client_id = ca and action = 'billing_status';
  insert into results values ('Billing status change is logged', n = 1, 'saw ' || n);
  reset role;

  -- ---------- phases 5-6: file requests, files, connections ----------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  insert into public.file_requests (client_id, title) values (ca, 'Logo PNG') returning id into new_id;
  insert into public.integrations (client_id, provider, external_id) values (ca, 'instagram', '17841400000000000'), (cb, 'facebook', '1000000000');
  insert into results values ('Admin can ask for files and connect accounts', true, null);
  reset role;
  insert into public.file_requests (client_id, title) values (cb, 'B menu') returning id into frb;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.file_requests;
  insert into results values ('A sees only own file requests', n = 1, 'saw ' || n);
  begin
    insert into public.file_requests (client_id, title) values (ca, 'self-made');
    insert into results values ('A cannot create file requests', false, 'succeeded');
  exception when others then insert into results values ('A cannot create file requests', true, sqlerrm); end;
  update public.file_requests set status = 'cancelled' where id = new_id;
  get diagnostics n = row_count;
  insert into results values ('A cannot change file requests directly', n = 0, 'updated ' || n);
  insert into public.files (client_id, bucket_path, file_name, category, file_request_id) values (ca, ca || '/upload/logo.png', 'logo.png', 'upload', new_id);
  select status into s from public.file_requests where id = new_id;
  insert into results values ('Uploading for a file request ticks it off', s = 'received', s);
  begin
    insert into public.files (client_id, bucket_path, file_name, category, file_request_id)
      values (ca, ca || '/upload/x.png', 'x.png', 'upload', frb);
    insert into results values ('A cannot answer B''s file request', false, 'succeeded');
  exception when others then insert into results values ('A cannot answer B''s file request', true, sqlerrm); end;
  begin
    insert into public.files (client_id, bucket_path, file_name, category) values (ca, ca || '/deliverable/y.png', 'y.png', 'upload');
    insert into results values ('Upload row cannot point into deliverables folder', false, 'succeeded');
  exception when others then insert into results values ('Upload row cannot point into deliverables folder', true, sqlerrm); end;
  update public.files set note = 'hacked' where client_id = ca;
  get diagnostics n = row_count;
  insert into results values ('A cannot edit file notes', n = 0, 'updated ' || n);
  select count(*) into n from public.integrations;
  insert into results values ('A cannot see connections', n = 0, 'saw ' || n);
  begin
    insert into public.integrations (client_id, provider, external_id) values (ca, 'google_ads', '1234567890');
    insert into results values ('A cannot add connections', false, 'succeeded');
  exception when others then insert into results values ('A cannot add connections', true, sqlerrm); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.files where client_id = ca;
  insert into results values ('B cannot see A''s files', n = 0, 'saw ' || n);
  delete from public.files where client_id = ca;
  get diagnostics n = row_count;
  insert into results values ('B cannot delete A''s files', n = 0, 'deleted ' || n);
  reset role;

  -- ---------- sign-ups ----------
  insert into public.signup_requests (user_id, kind, business_name, status) values (un, 'existing', 'Unlinked Co', 'pending'), (ub, 'prospect', 'B Biz', 'converted');
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.signup_requests;
  insert into results values ('Signed-up user sees only their own sign-up', n = 1, 'saw ' || n);
  update public.signup_requests set status = 'approved', client_id = ca where user_id = un;
  get diagnostics n = row_count;
  insert into results values ('Signed-up user cannot approve themselves', n = 0, 'updated ' || n);
  begin
    insert into public.signup_requests (user_id, kind, business_name) values (un, 'prospect', 'again');
    insert into results values ('Users cannot create sign-up rows directly', false, 'succeeded');
  exception when others then insert into results values ('Users cannot create sign-up rows directly', true, sqlerrm); end;
  j := public.portal_context();
  insert into results values ('portal_context reports the pending sign-up', (j -> 'signup' ->> 'status') = 'pending', (j -> 'signup')::text);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from public.signup_requests where user_id in (un, ub);
  insert into results values ('Admin sees all sign-ups', n = 2, 'saw ' || n);
  reset role;

  -- ---------- signed-out visitors ----------
  set local role anon;
  begin
    perform count(*) from public.clients;
    insert into results values ('Anon cannot read clients', false, 'succeeded');
  exception when others then insert into results values ('Anon cannot read clients', true, sqlerrm); end;
  begin
    perform public.portal_context();
    insert into results values ('Anon cannot call portal_context', false, 'succeeded');
  exception when others then insert into results values ('Anon cannot call portal_context', true, sqlerrm); end;
  reset role;

  raise exception 'RLS_RESULTS %', (select json_agg(r) from results r);
end
$test$;
