-- Daily jobs record the local date they ran for, so a restart or a second
-- worker never runs the same day's job twice.
create table job_runs (
  name text not null,
  run_date date not null,
  started_at timestamptz not null default now(),
  primary key (name, run_date)
);
alter table job_runs enable row level security;

