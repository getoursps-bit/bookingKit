create table staff (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  totp_secret text,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table staff enable row level security;

create table staff_sessions (
  id bigint generated always as identity primary key,
  staff_id bigint not null references staff (id) on delete cascade,
  session_hash text not null unique,
  device text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table staff_sessions enable row level security;

alter table message_outbox
  add constraint message_outbox_staff_fk foreign key (staff_id) references staff (id) on delete set null;

-- Browser push subscriptions. Only owner devices in version 1; the customer
-- column lets customer reminders be added later without a schema change.
create table push_subscriptions (
  id bigint generated always as identity primary key,
  staff_id bigint references staff (id) on delete cascade,
  customer_id bigint references customers (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  last_receipt_at timestamptz,
  created_at timestamptz not null default now(),
  check ((staff_id is null) <> (customer_id is null))
);
alter table push_subscriptions enable row level security;

create table ai_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('photo', 'summary')),
  appointment_id bigint not null references appointments (id) on delete cascade,
  pet_id bigint references pets (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  model text,
  prompt_version text,
  cost_agorot integer not null default 0,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, appointment_id, pet_id)
);
alter table ai_jobs enable row level security;

create table ai_spend (
  month date primary key,
  total_agorot integer not null default 0
);
alter table ai_spend enable row level security;
