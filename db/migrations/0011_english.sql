-- English as a second language. Additive only: every English field is
-- optional, and anything left empty shows the Hebrew text instead.

alter table business_profile add column tagline_en text;

alter table services add column name_en text, add column includes_en text;

alter table products add column name_en text, add column description_en text;

alter table gallery_images add column alt_en text, add column caption_en text;

-- English wording for each message. WhatsApp rows need the same template
-- approved in Meta in English before English sends can succeed.
alter table message_templates add column body_en text, add column subject_en text;

-- The language the customer booked in; their messages follow it.
alter table customers add column locale text not null default 'he' check (locale in ('he', 'en'));
