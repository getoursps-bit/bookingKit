-- Message text lives in data, in Hebrew, one row per message kind and channel.
create table message_templates (
  key text not null,
  channel text not null check (channel in ('messaging', 'email', 'push')),
  body_he text not null,
  subject_he text,
  -- Name of the template approved by Meta, for WhatsApp rows.
  provider_template text,
  category text check (category in ('authentication', 'utility', 'marketing')),
  primary key (key, channel)
);
alter table message_templates enable row level security;

-- Every outgoing message, owner alerts included. The channel is not fixed
-- when a row is queued: the worker asks route() for it at send time and
-- records each channel it tried, so a WhatsApp failure moves on to email
-- without a second row.
create table message_outbox (
  id bigint generated always as identity primary key,
  -- No fixed list: an extension may bring message kinds of its own.
  kind text not null,
  appointment_id bigint references appointments (id) on delete set null,
  customer_id bigint references customers (id) on delete set null,
  staff_id bigint,
  template_key text not null,
  data jsonb not null default '{}'::jsonb,
  send_at timestamptz not null default now(),
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped'
  )),
  channel text check (channel in ('messaging', 'email', 'push')),
  tried_channels text[] not null default '{}',
  attempts integer not null default 0,
  provider_ref text,
  cost_agorot integer not null default 0,
  error text,
  -- Stops the same message being queued twice, e.g. 'reminder:<id>:<start>'.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_outbox_due_idx on message_outbox (status, send_at);
create index message_outbox_provider_ref_idx on message_outbox (provider_ref);
alter table message_outbox enable row level security;

-- Replies sent to the automated WhatsApp number.
create table inbound_messages (
  id bigint generated always as identity primary key,
  to_number text not null,
  from_number text not null,
  body text,
  provider_ref text unique,
  received_at timestamptz not null default now(),
  customer_id bigint references customers (id) on delete set null
);
alter table inbound_messages enable row level security;

-- The owner's record of what happened. Alerts point here; a lost push never
-- loses the event. The core's types are booking_created, booking_moved,
-- booking_cancelled, message_failed, reply_received, alerts_stopped and
-- message_cap; an extension may add its own, so the type is not a fixed list.
create table owner_events (
  id bigint generated always as identity primary key,
  type text not null,
  appointment_id bigint references appointments (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index owner_events_unread_idx on owner_events (created_at) where read_at is null;
alter table owner_events enable row level security;
