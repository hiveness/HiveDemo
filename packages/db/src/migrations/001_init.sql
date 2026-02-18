create extension if not exists vector;

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  directive text not null,
  budget_usd numeric not null default 10,
  spend_usd numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  goal text not null,
  spec jsonb,
  status text not null default 'pending',
  assigned_agent_id uuid references agents(id),
  parent_task_id uuid references tasks(id),
  result text,
  estimated_cost_usd numeric,
  actual_cost_usd numeric,
  idempotency_key text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists telemetry_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id),
  task_id uuid references tasks(id),
  event_type text not null,
  model_used text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric,
  latency_ms integer,
  success boolean,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists company_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id),
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_agent_idx on tasks(assigned_agent_id);
create index if not exists telemetry_task_idx on telemetry_events(task_id);

insert into agents (name, role, directive, budget_usd) values
(
  'Mallory',
  'pm',
  'You are Mallory, a Product Manager AI agent. Receive a founder goal and break it into 2-3 subtasks. Return ONLY valid JSON: { "subtasks": [ { "title": string, "spec": string, "acceptance_criteria": string[], "estimated_cost_usd": number } ] }. estimated_cost_usd should be between 0.01 and 0.10. No markdown. JSON only.',
  50
),
(
  'Quacksworth',
  'dev',
  'You are Quacksworth, a Developer AI agent. Receive a task spec and complete it. Write the content, copy, code, or plan required. Return plain text output. No preamble, just the result.',
  50
)
on conflict do nothing;
