-- ── TIER 1: Core Memory ──────────────────────────────────────────────────
-- Stored on the agents table. Add these columns if not present:
alter table agents
  add column if not exists core_memory jsonb not null default '{}',
  add column if not exists persona     text,
  add column if not exists company_id  uuid;

-- ── Companies table (needed for multi-tenant onboarding) ─────────────────
create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,                        -- what the founder typed at onboarding
  industry      text,
  stage         text,                        -- 'idea' | 'mvp' | 'growth' | 'scale'
  core_values   text[],
  founder_id    text,
  created_at    timestamptz default now()
);

-- Now add the foreign key
alter table agents
  add constraint agents_company_id_fkey foreign key (company_id) references companies(id);

-- ── TIER 3: Episodic Memory ───────────────────────────────────────────────
create table if not exists agent_episodes (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references agents(id) on delete cascade,
  company_id    uuid references companies(id),
  task_id       uuid references tasks(id),
  episode_type  text not null,               -- 'task_complete' | 'task_failed' | 'decision' | 'correction' | 'learning'
  summary       text not null,              -- 1-3 sentence summary of what happened
  outcome       text,                       -- 'success' | 'failure' | 'partial'
  importance    integer default 5,          -- 1-10, higher = recalled more often
  metadata      jsonb default '{}',
  created_at    timestamptz default now()
);

create index if not exists episodes_agent_idx     on agent_episodes(agent_id);
create index if not exists episodes_company_idx   on agent_episodes(company_id);
create index if not exists episodes_importance_idx on agent_episodes(importance desc);
create index if not exists episodes_created_idx   on agent_episodes(created_at desc);

-- ── TIER 4: Semantic Memory ───────────────────────────────────────────────
-- Uses existing company_memory table. Add company_id and scope:
alter table company_memory
  add column if not exists company_id  uuid references companies(id),
  add column if not exists scope       text default 'company',  -- 'company' | 'agent' | 'domain'
  add column if not exists source_type text,                     -- 'onboarding' | 'task_output' | 'correction' | 'manual'
  add column if not exists importance  integer default 5;

create index if not exists memory_company_idx on company_memory(company_id);
create index if not exists memory_scope_idx   on company_memory(scope);

-- Vector similarity index (IVFFlat — fast approximate search)
-- Note: Requires pgvector extension which should be enabled in 001_init.sql
create index if not exists memory_embedding_idx
  on company_memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Search RPC
create or replace function search_memory(
  query_embedding vector(1536),
  company_id_filter uuid,
  match_count int default 8,
  min_importance int default 3
)
returns table (
  id uuid,
  content text,
  scope text,
  source_type text,
  importance int,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    cm.id,
    cm.content,
    cm.scope,
    cm.source_type,
    cm.importance,
    1 - (cm.embedding <=> query_embedding) as similarity
  from company_memory cm
  where
    cm.company_id = company_id_filter
    and cm.importance >= min_importance
    and cm.embedding is not null
  order by cm.embedding <=> query_embedding
  limit match_count;
end;
$$;
