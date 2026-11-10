-- How a booking request ended when it was not approved: the owner refused it
-- (with an optional reason for the customer), or nobody answered before its
-- time. The booking itself is then cancelled; this row says why.
create table booking_requests (
  appointment_id bigint primary key references appointments (id) on delete cascade,
  outcome text not null check (outcome in ('refused', 'expired')),
  reason text,
  decided_at timestamptz not null default now()
);
alter table booking_requests enable row level security;
