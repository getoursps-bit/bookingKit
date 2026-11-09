-- Pet photos for AI analysis. The file is in private storage; the row says
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

-- Pet photo suggestions the customer accepted.
alter table pets add column coat_type text;
alter table pets add column coat_condition text
  check (coat_condition in ('normal', 'tangled', 'matted', 'very_matted', 'unclear'));
