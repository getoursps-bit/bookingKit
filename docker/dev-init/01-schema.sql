-- Local only: mirrors the server setup, where the app connects with its own
-- restricted role that has rights on the fluffyfur schema and nothing else.
create schema if not exists fluffyfur;
create role fluffyfur_app login password 'fluffyfur-dev';
grant usage, create on schema fluffyfur to fluffyfur_app;
alter default privileges in schema fluffyfur
  grant select, insert, update, delete on tables to fluffyfur_app;
alter default privileges in schema fluffyfur
  grant usage, select on sequences to fluffyfur_app;
-- Extensions are created by the superuser; migrations only check for them.
create extension if not exists btree_gist;
create extension if not exists pgcrypto;
