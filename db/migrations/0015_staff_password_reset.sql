-- A staff member who forgot the password sets a new one with a 6-digit code
-- sent to the staff email. Kept apart from the login code, so asking for one
-- never cancels the other. Only the code's keyed hash is kept, with its
-- expiry and the number of tries.
alter table staff
  add column reset_code_hash text,
  add column reset_code_expires_at timestamptz,
  add column reset_code_attempts integer not null default 0;
