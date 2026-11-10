-- One row per AI call asked for: its kind (the extension that asks names it),
-- the booking it is about and, when the kind needs one, a subject within the
-- booking (a pet, say). The result is whatever the kind stores.
create table ai_jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  appointment_id bigint not null references appointments (id) on delete cascade,
  subject_id bigint,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  model text,
  prompt_version text,
  cost_agorot integer not null default 0,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, appointment_id, subject_id)
);
alter table ai_jobs enable row level security;

-- What AI cost each month, counted against the owner's monthly cap.
create table ai_spend (
  month date primary key,
  total_agorot integer not null default 0
);
alter table ai_spend enable row level security;
