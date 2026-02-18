
-- ── Conversation History ──────────────────────────────────────────────────────
-- This table stores all messages between users and agents.
-- It is essential for "short-term memory" (context hydration).

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null,                -- 'telegram-123' or UUID
  sender_id     text,                         -- Agent UUID or NULL (User)
  receiver_id   text,                         -- Agent UUID or NULL (Broadcast)
  payload       text,                         -- The actual message text
  type          text,                         -- 'user_message', 'agent_response', 'tool_call', 'tool_result'
  metadata      jsonb default '{}',
  created_at    timestamptz default now()
);

-- Index for fast retrieval of latest messages in a session
create index if not exists messages_session_created_idx 
  on messages (session_id, created_at desc);

-- Optional: Enable RLS so users can only see their own sessions
-- alter table messages enable row level security;
-- create policy "Users can see own session messages" on messages
--   for select using (auth.uid()::text = session_id); -- simplistic example
