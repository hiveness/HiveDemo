-- ── Tool registry ─────────────────────────────────────────────────────────────
create table if not exists tools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,       -- 'web_search', 'fetch_url', 'github_create_file'
  description   text not null,
  category      text not null,              -- 'research' | 'code' | 'data' | 'communication'
  input_schema  jsonb not null,             -- JSON Schema for inputs
  output_schema jsonb not null,
  requires_key  text,                       -- env var name for API key, if needed
  policy_level  text default 'auto',        -- 'auto' | 'approval_required' | 'blocked'
  enabled       boolean default true,
  call_count    integer default 0,
  created_at    timestamptz default now()
);

-- ── Tool call log (append-only) ───────────────────────────────────────────────
create table if not exists tool_calls (
  id            uuid primary key default gen_random_uuid(),
  tool_name     text not null,
  agent_id      uuid references agents(id),
  task_id       uuid references tasks(id),
  input         jsonb not null,
  output        jsonb,
  success       boolean,
  error_message text,
  latency_ms    integer,
  created_at    timestamptz default now()
);

create index if not exists tool_calls_task_idx  on tool_calls(task_id);
create index if not exists tool_calls_agent_idx on tool_calls(agent_id);
create index if not exists tool_calls_name_idx  on tool_calls(tool_name);
