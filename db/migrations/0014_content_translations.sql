-- The translation module's own table: what the business enters, in every
-- language but the site's default one. The default language stays in each
-- table's own column (name_he, body_he and so on, whatever that language is),
-- so a site with one language never has a row here and a new language needs
-- no new column.
create table content_translations (
  -- 'service', 'product', 'gallery_image', 'profile', 'message_template'
  entity text not null,
  -- The row's key as text: its id, or "key:channel" for a message template.
  entity_key text not null,
  field text not null,
  locale text not null check (locale ~ '^[a-z]{2}$'),
  value text not null,
  primary key (entity, entity_key, field, locale)
);
alter table content_translations enable row level security;

-- Carry over the English text entered so far. The old _en columns stay, so
-- the previous version keeps running on this database; they are no longer
-- read or written.
insert into content_translations (entity, entity_key, field, locale, value)
select 'service', id::text, 'name', 'en', trim(name_en) from services where nullif(trim(name_en), '') is not null
union all
select 'service', id::text, 'includes', 'en', trim(includes_en) from services where nullif(trim(includes_en), '') is not null
union all
select 'product', id::text, 'name', 'en', trim(name_en) from products where nullif(trim(name_en), '') is not null
union all
select 'product', id::text, 'description', 'en', trim(description_en) from products where nullif(trim(description_en), '') is not null
union all
select 'gallery_image', id::text, 'alt', 'en', trim(alt_en) from gallery_images where nullif(trim(alt_en), '') is not null
union all
select 'gallery_image', id::text, 'caption', 'en', trim(caption_en) from gallery_images where nullif(trim(caption_en), '') is not null
union all
select 'profile', id::text, 'tagline', 'en', trim(tagline_en) from business_profile where nullif(trim(tagline_en), '') is not null
union all
select 'message_template', key || ':' || channel, 'body', 'en', trim(body_en) from message_templates where nullif(trim(body_en), '') is not null
union all
select 'message_template', key || ':' || channel, 'subject', 'en', trim(subject_en) from message_templates where nullif(trim(subject_en), '') is not null;

-- A customer's language may be any language a site offers, not only Hebrew or English.
alter table customers drop constraint if exists customers_locale_check;
alter table customers add constraint customers_locale_check check (locale ~ '^[a-z]{2}$');
