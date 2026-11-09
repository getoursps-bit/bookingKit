-- Owner login by a 6-digit code sent to the staff email, offered next to the
-- password and authenticator-app login. Only the code's keyed hash is kept,
-- with its expiry and the number of tries.
alter table staff
  add column email_code_hash text,
  add column email_code_expires_at timestamptz,
  add column email_code_attempts integer not null default 0;

-- The new message kind for that code. Widening the list keeps every existing row valid.
alter table message_outbox drop constraint message_outbox_kind_check;
alter table message_outbox add constraint message_outbox_kind_check check (kind in (
  'code', 'confirmation', 'reminder', 'customer_change', 'owner_change',
  'import_link', 'owner_alert', 'owner_check', 'auto_reply', 'staff_code'
));
