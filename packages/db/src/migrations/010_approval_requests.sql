-- ── Approval Requests (Human-in-the-Loop Gate) ──────────────────────────────
create table if not exists approval_requests (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  agent_id    text not null,
  tool        text not null,
  args        jsonb not null,
  status      text default 'pending'
                check (status in ('pending', 'approved', 'denied', 'timeout')),
  created_at  timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists approval_requests_session_status_idx
  on approval_requests (session_id, status);
