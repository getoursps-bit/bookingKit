-- What the fake WhatsApp and email channels "sent", so local runs and the
-- end-to-end tests can read codes and confirmations. Only the fakes write
-- here (PROVIDERS=fake); with real providers the table stays empty.
create table fake_messages (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('whatsapp', 'email', 'push')),
  recipient text not null,
  template_key text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index fake_messages_recipient_idx on fake_messages (recipient, created_at);
alter table fake_messages enable row level security;
