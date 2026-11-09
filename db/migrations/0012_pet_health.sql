-- What the customer confirms about each pet when booking: the vet (or clinic)
-- that treats it, and when they last confirmed its vaccines are up to date.
-- The certificate itself is shown at the salon; no file is stored.
alter table pets add column vet_name text check (char_length(vet_name) <= 80);
alter table pets add column vaccines_confirmed_at timestamptz;
