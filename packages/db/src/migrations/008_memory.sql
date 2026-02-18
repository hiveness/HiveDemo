-- Enable the vector extension for embeddings
create extension if not exists vector;

-- Create memories table
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  content text not null,
  embedding vector(1536), -- Dimension for OpenAI text-embedding-3-small
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster vector search
create index on memories using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Function for vector similarity search
create or replace function match_memories (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  match_agent_id uuid
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    memories.id,
    memories.content,
    memories.metadata,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where memories.agent_id = match_agent_id
  and 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
