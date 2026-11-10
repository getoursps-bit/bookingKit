-- A second opening range on a weekday, after the first: a morning and a late
-- afternoon with a break between them. Both set or both empty.
alter table opening_hours add column opens2 time, add column closes2 time;
alter table opening_hours add constraint opening_hours_second_range_check
  check ((opens2 is null and closes2 is null)
         or (opens2 is not null and closes2 is not null and closes2 > opens2));
