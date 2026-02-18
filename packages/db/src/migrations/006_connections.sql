-- ── Integration Connections ─────────────────────────────────────────────────────
create table if not exists connections (
    id uuid primary key default gen_random_uuid(),
    name text unique not null,
    tokens jsonb not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
