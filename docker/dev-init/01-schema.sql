-- Local only: mirrors the server setup, where the app connects with its own
-- restricted role that has rights on its own schema and nothing else. The
-- schema is named by DB_SCHEMA ("app" when not set).
create schema if not exists app;
create role app_user login password 'app-dev';
grant usage, create on schema app to app_user;
alter default privileges in schema app
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema app
  grant usage, select on sequences to app_user;
-- Extensions are created by the superuser; migrations only check for them.
create extension if not exists btree_gist;
create extension if not exists pgcrypto;
