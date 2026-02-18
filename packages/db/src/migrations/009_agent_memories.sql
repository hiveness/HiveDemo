-- ── Prompt 05: Persistent Cross-Session Agent Memory ─────────────────────────
-- Additive migration — does not touch any existing tables.
-- Requires pgvector (already enabled in 008_memory.sql).

-- Agent-scoped long-term memory table
create table if not exists agent_memories (
  id            uuid primary key default gen_random_uuid(),
  agent_id      text not null,                -- text so it works with both UUID and name-based IDs
  content       text not null,
  embedding     vector(1536),                 -- OpenAI text-embedding-3-small dimensions
  tags          text[] default '{}',
  importance    text default 'medium'
                  check (importance in ('low', 'medium', 'high')),
  created_at    timestamptz default now(),
  accessed_at   timestamptz default now(),
  access_count  int default 0
);

-- Fast semantic search index
create index if not exists agent_memories_embedding_idx
  on agent_memories using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Fast agent-specific queries
create index if not exists agent_memories_agent_idx
  on agent_memories (agent_id, importance, accessed_at desc);

-- ── RPC: Semantic search scoped to a single agent ────────────────────────────
create or replace function match_agent_memories(
  query_embedding  vector(1536),
  match_threshold  float,
  match_count      int,
  p_agent_id       text
)
returns table (
  id          uuid,
  content     text,
  tags        text[],
  importance  text,
  similarity  float
)
language sql
stable
as $$
  select
    id,
    content,
    tags,
    importance,
    1 - (embedding <=> query_embedding) as similarity
  from agent_memories
  where agent_id = p_agent_id
    and embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
