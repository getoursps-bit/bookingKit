-- Salon content the owner edits in the admin. Money is in agorot (1/100 ILS).

create table business_profile (
  id smallint primary key default 1 check (id = 1),
  name text not null,
  tagline text,
  city text,
  address text,
  phone_e164 text,
  social jsonb not null default '{}'::jsonb,
  logo_key text,
  cover_key text,
  updated_at timestamptz not null default now()
);
alter table business_profile enable row level security;

create table gallery_images (
  id bigint generated always as identity primary key,
  storage_key text not null unique,
  alt_he text not null,
  caption_he text,
  sort_order integer not null default 0,
  -- Owner confirmed the photo may be shown publicly.
  consent boolean not null default false,
  created_at timestamptz not null default now()
);
alter table gallery_images enable row level security;

create table products (
  id bigint generated always as identity primary key,
  name_he text not null unique,
  description_he text,
  price_agorot integer not null check (price_agorot >= 0),
  image_key text,
  active boolean not null default true,
  sort_order integer not null default 0
);
alter table products enable row level security;

create table services (
  id bigint generated always as identity primary key,
  name_he text not null unique,
  includes_he text,
  duration_min integer not null check (duration_min > 0),
  price_from_agorot integer not null check (price_from_agorot >= 0),
  bookable_online boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0
);
alter table services enable row level security;

-- Turns a customer's description of a pet into a service. A null attribute
-- matches any value; the most specific rule wins, age before weight.
create table service_rules (
  id bigint generated always as identity primary key,
  species text not null check (species in ('dog', 'cat')),
  age_group text check (age_group in ('young', 'adult')),
  weight_group text check (weight_group in ('small', 'large', 'unknown')),
  request text not null check (request in ('groom', 'nails')),
  service_id bigint not null references services (id),
  unique nulls not distinct (species, age_group, weight_group, request)
);
alter table service_rules enable row level security;

-- Local Israel wall-clock times; turned into UTC per date by the app.
create table opening_hours (
  weekday smallint primary key check (weekday between 0 and 6), -- 0 = Sunday
  opens time,
  closes time,
  closed boolean not null default false,
  check (closed or (opens is not null and closes is not null and closes > opens))
);
alter table opening_hours enable row level security;

create table time_off (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_range_idx on time_off (starts_at, ends_at);
alter table time_off enable row level security;

-- Daily click counts ("Book", "Order on WhatsApp") for the success measures.
create table site_counters (
  day date not null,
  key text not null,
  count integer not null default 0,
  primary key (day, key)
);
alter table site_counters enable row level security;
