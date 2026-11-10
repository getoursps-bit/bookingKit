create table customers (
  id bigint generated always as identity primary key,
  display_name text not null,
  phone_e164 text unique,
  notes text,
  no_show_count integer not null default 0,
  source text not null check (source in ('online', 'owner', 'import')),
  dibs_ref text unique,
  created_at timestamptz not null default now(),
  -- Set when personal data was erased on request; the row keeps booking history.
  erased_at timestamptz
);
alter table customers enable row level security;

-- A verified phone or email proves who the customer is.
create table customer_contacts (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers (id) on delete cascade,
  kind text not null check (kind in ('phone', 'email')),
  value text not null,
  verified_at timestamptz,
  unique (kind, value)
);
create index customer_contacts_customer_idx on customer_contacts (customer_id);
alter table customer_contacts enable row level security;

create table appointments (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers (id),
  -- One groomer today. The column exists because the no-overlap rule needs
  -- something to group by.
  groomer smallint not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status text not null check (status in ('held', 'confirmed', 'cancelled', 'completed', 'no_show', 'released')),
  hold_expires_at timestamptz,
  created_by text not null check (created_by in ('customer', 'owner', 'import')),
  source jsonb not null default '{}'::jsonb,
  notes text,
  dibs_ref text unique,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'held' or hold_expires_at is not null),
  -- No two live bookings for the same groomer may overlap. Held slots count,
  -- so nobody can take a slot while its customer types the code.
  constraint appointments_no_overlap
    exclude using gist (groomer with =, during with &&)
    where (status in ('held', 'confirmed'))
);
create index appointments_starts_idx on appointments (starts_at);
create index appointments_customer_idx on appointments (customer_id);
create index appointments_held_idx on appointments (hold_expires_at) where status = 'held';
alter table appointments enable row level security;

-- One line per booked service. Service, duration and price are copied at
-- booking time so history survives later price edits. An extension that
-- keeps something about a line adds its own column or table.
create table appointment_lines (
  appointment_id bigint not null references appointments (id) on delete cascade,
  position smallint not null check (position >= 1),
  service_id bigint not null references services (id),
  duration_min integer not null check (duration_min > 0),
  price_from_agorot integer not null check (price_from_agorot >= 0),
  primary key (appointment_id, position)
);
alter table appointment_lines enable row level security;

create table manage_tokens (
  id bigint generated always as identity primary key,
  appointment_id bigint not null references appointments (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index manage_tokens_appointment_idx on manage_tokens (appointment_id);
alter table manage_tokens enable row level security;

create table trusted_devices (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table trusted_devices enable row level security;

create table verification_codes (
  id bigint generated always as identity primary key,
  contact text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  code_hash text not null,
  appointment_id bigint references appointments (id) on delete cascade,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index verification_codes_contact_idx on verification_codes (contact, created_at);
alter table verification_codes enable row level security;

-- Counters for per-phone and per-address limits. Kept in Postgres because the
-- container keeps no state between requests.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;

create table consents (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers (id) on delete cascade,
  purpose text not null check (purpose in ('appointment_messages', 'photo_analysis', 'gallery_photo')),
  channel text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null
);
create index consents_customer_idx on consents (customer_id, purpose);
alter table consents enable row level security;
