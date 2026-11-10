-- Everything the pets extension keeps. The core's tables are made first.

create table pets (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers (id) on delete cascade,
  name text not null,
  species text not null check (species in ('dog', 'cat')),
  breed text,
  age_group text not null check (age_group in ('young', 'adult')),
  weight_group text check (weight_group in ('small', 'large', 'unknown')),
  coat_notes text,
  temperament_note text,
  -- What the customer accepted from a photo's analysis.
  coat_type text,
  coat_condition text check (coat_condition in ('normal', 'tangled', 'matted', 'very_matted', 'unclear')),
  -- What the customer confirms about each pet when booking: the vet (or clinic)
  -- that treats it, and when they last confirmed its vaccines are up to date.
  -- The certificate itself is shown at the salon; no file is stored.
  vet_name text check (char_length(vet_name) <= 80),
  vaccines_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index pets_customer_idx on pets (customer_id);
alter table pets enable row level security;

-- Which pet a booked line is for. The core's lines table knows only the
-- service; this column is the extension's.
alter table appointment_lines add column pet_id bigint references pets (id) on delete set null;

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

-- Pet photos for analysis. The file is in private storage; the row says
-- which pet and visit it belongs to, so it can be deleted 90 days after it.
create table pet_photos (
  id bigint generated always as identity primary key,
  pet_id bigint not null references pets (id) on delete cascade,
  appointment_id bigint not null references appointments (id) on delete cascade,
  storage_key text not null unique,
  created_at timestamptz not null default now(),
  unique (pet_id, appointment_id)
);
create index pet_photos_appointment_idx on pet_photos (appointment_id);
alter table pet_photos enable row level security;
