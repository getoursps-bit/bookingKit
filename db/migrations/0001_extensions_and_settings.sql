-- Extensions are installed by a database administrator (docker/dev-init
-- locally, the server side in production). The app role cannot create them,
-- so this migration only checks they exist.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    raise exception 'Extension btree_gist is missing; ask the database administrator to run: create extension btree_gist';
  end if;
end
$$;

-- Row-level security is on for every table, with no policies: only the role
-- that owns the tables (the app role, which runs the migrations) can read or
-- write them. Any other role, such as Supabase's public roles, sees nothing.

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;

create table audit_log (
  id bigint generated always as identity primary key,
  staff_id bigint,
  actor text not null check (actor in ('staff', 'customer', 'system', 'import')),
  entity text not null,
  entity_id text,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, created_at);
alter table audit_log enable row level security;
