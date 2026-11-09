-- The limit on a booking's lines is the core's, not the pets extension's:
-- "booking.maxLines" takes over from "booking.maxPets". The old row stays, so
-- the previous version keeps reading its own setting.
insert into settings (key, value)
select 'booking.maxLines', value from settings where key = 'booking.maxPets'
on conflict (key) do nothing;
