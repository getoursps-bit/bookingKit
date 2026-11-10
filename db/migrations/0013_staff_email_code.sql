-- Owner login by a 6-digit code sent to the staff email, offered next to the
-- password and authenticator-app login. Only the code's keyed hash is kept,
-- with its expiry and the number of tries.
alter table staff
  add column email_code_hash text,
  add column email_code_expires_at timestamptz,
  add column email_code_attempts integer not null default 0;

