-- ── Trigger definitions ───────────────────────────────────────────────────────
create table if not exists triggers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id),
  name          text not null,
  description   text,
  trigger_type  text not null,    -- 'schedule' | 'threshold' | 'event'
  enabled       boolean default true,

  -- Schedule trigger config
  cron_expr     text,             -- '0 9 * * 1' = every Monday 9am

  -- Threshold trigger config
  metric        text,             -- 'task_failure_rate' | 'spend_usd' | 'tasks_completed'
  threshold_op  text,             -- 'gt' | 'lt' | 'gte' | 'lte' | 'eq'
  threshold_val numeric,
  window_mins   integer,          -- evaluate metric over this window

  -- Event trigger config
  event_type    text,             -- 'task_completed' | 'task_failed' | 'budget_warning'

  -- What to do when triggered
  goal_template text not null,    -- goal to fire, supports {{variables}}
  budget_usd    numeric default 1,
  policy_level  text default 'approval_required',  -- 'auto' | 'approval_required'

  last_fired_at timestamptz,
  fire_count    integer default 0,
  created_at    timestamptz default now()
);

-- ── Pending approvals ─────────────────────────────────────────────────────────
create table if not exists pending_approvals (
  id            uuid primary key default gen_random_uuid(),
  trigger_id    uuid references triggers(id),
  company_id    uuid references companies(id),
  goal          text not null,
  context       jsonb default '{}',  -- what caused this trigger to fire
  status        text default 'pending',  -- 'pending' | 'approved' | 'rejected' | 'expired'
  telegram_msg_id text,              -- so we can edit the message after approval
  expires_at    timestamptz default (now() + interval '24 hours'),
  decided_at    timestamptz,
  created_at    timestamptz default now()
);

-- ── Policy rules ──────────────────────────────────────────────────────────────
create table if not exists policy_rules (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id),
  name          text not null,
  description   text,
  -- What this rule matches
  trigger_type  text,             -- null = matches all types
  max_budget    numeric,          -- auto-allow if budget below this
  goal_patterns text[],           -- regex patterns — if goal matches, rule applies
  -- What to do
  action        text not null,    -- 'auto_approve' | 'require_approval' | 'block'
  priority      integer default 5, -- higher = evaluated first
  enabled       boolean default true,
  created_at    timestamptz default now()
);

create index if not exists triggers_company_idx    on triggers(company_id);
create index if not exists triggers_type_idx       on triggers(trigger_type);
create index if not exists approvals_status_idx    on pending_approvals(status);
create index if not exists approvals_expires_idx   on pending_approvals(expires_at);

-- ── Helper functions ──────────────────────────────────────────────────────────
create or replace function increment_trigger_fire_count(trigger_uuid uuid)
returns void as $$
begin
  update triggers
  set fire_count = fire_count + 1
  where id = trigger_uuid;
end;
$$ language plpgsql;
