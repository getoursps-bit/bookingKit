-- Dibs import: each run stages the export, checks it, and keeps its report.
-- Staged rows stay for the reconciliation report and are never shown to customers.
create table import_runs (
  id bigint generated always as identity primary key,
  file_name text not null,
  dry_run boolean not null,
  freeze_time timestamptz not null,
  report jsonb,
  created_at timestamptz not null default now()
);
alter table import_runs enable row level security;

create table import_dibs_customers (
  run_id bigint not null references import_runs (id) on delete cascade,
  phone_e164 text not null,
  display_name text not null,
  -- Every Dibs name seen for this phone, when duplicates were merged.
  other_names text[] not null default '{}',
  primary key (run_id, phone_e164)
);
alter table import_dibs_customers enable row level security;

create table import_dibs_appointments (
  run_id bigint not null references import_runs (id) on delete cascade,
  row_no integer not null,
  dibs_ref text,
  name text,
  phone_raw text,
  phone_e164 text,
  starts_at timestamptz,
  duration_min integer,
  service_raw text,
  service_id bigint references services (id),
  notes text,
  -- Why the row cannot be imported: bad_phone, bad_time, unmapped_service,
  -- missing_ref, duplicate_ref or clash. Null when it is fine.
  problem text,
  primary key (run_id, row_no)
);
alter table import_dibs_appointments enable row level security;
