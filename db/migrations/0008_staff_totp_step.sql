-- The last TOTP time step a staff member used, so the same code cannot be
-- used twice (for example by someone watching over a shoulder).
alter table staff add column totp_last_step bigint;
