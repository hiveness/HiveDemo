-- ── Telemetry Events ─────────────────────────────────────────────────────────
-- Powers the HIVE APL engine, agent reputation scores, and HQ dashboard.
--
-- NOTE: This reflects the ACTUAL schema in the database.
-- The table uses: model_used, input_tokens, output_tokens (not model/cost_tokens)
-- event_type has no check constraint (allows any string value)

create table if not exists telemetry_events (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null,
  task_id       uuid,
  event_type    text not null,
  model_used    text,                         -- for model_call events
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10,6),
  latency_ms    int,
  success       boolean default true,
  payload       jsonb,
  created_at    timestamptz default now()
);

-- Indexes for APL queries and dashboard
create index if not exists telemetry_events_agent_type_ts_idx
  on telemetry_events (agent_id, event_type, created_at desc);

create index if not exists telemetry_events_task_idx
  on telemetry_events (task_id, created_at desc);

create index if not exists telemetry_events_type_success_ts_idx
  on telemetry_events (event_type, success, created_at desc);

-- ── Agent Telemetry Summary Function ─────────────────────────────────────────
create or replace function agent_telemetry_summary(p_agent_id uuid, p_days int default 7)
returns json language sql stable as $$
  select json_build_object(
    'total_tool_calls',    count(*) filter (where event_type = 'tool_call' or event_type = 'tool_calls'),
    'total_model_calls',   count(*) filter (where event_type = 'model_call'),
    'success_rate',        round(100.0 * count(*) filter (where success) / nullif(count(*), 0), 1),
    'total_cost_usd',      round(sum(cost_usd)::numeric, 4),
    'total_input_tokens',  sum(input_tokens),
    'total_output_tokens', sum(output_tokens),
    'avg_latency_ms',      round(avg(latency_ms) filter (where event_type = 'model_call'))
  )
  from telemetry_events
  where agent_id = p_agent_id
    and created_at > now() - (p_days || ' days')::interval;
$$;
