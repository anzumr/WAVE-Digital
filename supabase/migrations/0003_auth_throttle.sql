-- Rate limiting for the public "forgot password" function. Only the service role touches it.
create table public.auth_throttle (
  id bigint generated always as identity primary key,
  key text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index auth_throttle_lookup_idx on public.auth_throttle (kind, key, created_at desc);
alter table public.auth_throttle enable row level security;
revoke all on public.auth_throttle from anon, authenticated;
