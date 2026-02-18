-- ── Artifact Storage ────────────────────────────────────────────────────────────
create table if not exists hive_artifacts (
    id uuid primary key default gen_random_uuid(),
    type text not null, -- 'html', 'pdf', 'form', 'react'
    content text not null,
    title text,
    description text,
    created_at timestamptz default now(),
    expires_at timestamptz default (now() + interval '1 hour')
);

-- Ensure description column exists if table already existed
do $$ 
begin 
  if not exists (select 1 from information_schema.columns where table_name = 'hive_artifacts' and column_name = 'description') then
    alter table hive_artifacts add column description text;
  end if;
end $$;
