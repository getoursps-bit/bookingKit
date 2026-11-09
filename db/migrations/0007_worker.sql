-- Daily jobs record the local date they ran for, so a restart or a second
-- worker never runs the same day's job twice.
create table job_runs (
  name text not null,
  run_date date not null,
  started_at timestamptz not null default now(),
  primary key (name, run_date)
);
alter table job_runs enable row level security;

-- The one fixed reply to a message sent to the automated number. Widening the
-- list of kinds keeps every existing row valid.
alter table message_outbox drop constraint message_outbox_kind_check;
alter table message_outbox add constraint message_outbox_kind_check check (kind in (
  'code', 'confirmation', 'reminder', 'customer_change', 'owner_change',
  'import_link', 'owner_alert', 'owner_check', 'auto_reply'
));
