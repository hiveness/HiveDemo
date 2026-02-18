-- ── Agent Identity & Memory ───────────────────────────────────────────────────
alter table agents add column if not exists name text;
alter table agents add column if not exists soul_md text;
alter table agents add column if not exists about_md text;
alter table agents add column if not exists memory_md text;
