-- ── Artifacts V2 — add missing columns & update type constraint ────────────────
-- Adds: description, agent_id, session_id
-- Updates: type check constraint to include 'csv' and 'markdown'
-- Updates: expires_at default from 1 hour → 24 hours

-- Add missing columns (safe — uses IF NOT EXISTS pattern via DO block)
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_name = 'hive_artifacts' and column_name = 'description'
    ) then
        alter table hive_artifacts add column description text;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_name = 'hive_artifacts' and column_name = 'agent_id'
    ) then
        alter table hive_artifacts add column agent_id text;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_name = 'hive_artifacts' and column_name = 'session_id'
    ) then
        alter table hive_artifacts add column session_id text;
    end if;
end $$;

-- Drop old type check constraint if it exists (name may vary)
do $$
begin
    -- Drop any existing check constraint on 'type' column
    if exists (
        select 1 from information_schema.table_constraints
        where table_name = 'hive_artifacts'
          and constraint_type = 'CHECK'
          and constraint_name like '%type%'
    ) then
        execute (
            select 'alter table hive_artifacts drop constraint ' || constraint_name
            from information_schema.table_constraints
            where table_name = 'hive_artifacts'
              and constraint_type = 'CHECK'
              and constraint_name like '%type%'
            limit 1
        );
    end if;
end $$;

-- Add updated type check constraint
alter table hive_artifacts
    add constraint hive_artifacts_type_check
    check (type in ('html', 'pdf', 'form', 'react', 'csv', 'markdown'));

-- Update default expiry to 24 hours for new rows
alter table hive_artifacts
    alter column expires_at set default (now() + interval '24 hours');

-- Index for session-scoped queries
create index if not exists hive_artifacts_session_created
    on hive_artifacts (session_id, created_at desc);
