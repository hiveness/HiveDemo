
-- 1. Ensure 'agent_id' column exists (Critical for chat lookup)
alter table agents add column if not exists agent_id text unique;

-- 2. Ensure memory columns exist (from 002_memory.sql)
alter table agents add column if not exists core_memory jsonb not null default '{}';
alter table agents add column if not exists persona text;
alter table agents add column if not exists company_id uuid;

-- 3. Ensure metadata columns exist (from 005_agent_identity.sql)
alter table agents add column if not exists soul_md text;
alter table agents add column if not exists about_md text;
alter table agents add column if not exists memory_md text;

-- 4. Backfill agent_id for existing agents if null
update agents set agent_id = 'pm' where role = 'pm' and agent_id is null;
update agents set agent_id = 'dev' where role = 'dev' and agent_id is null;

-- 5. Insert Orchestrator if it doesn't exist
insert into agents (
    name, 
    role, 
    agent_id, 
    directive, 
    budget_usd, 
    core_memory, 
    soul_md, 
    about_md
) values (
    'HIVE Orchestrator',
    'orchestrator',
    'orchestrator',
    'You are the HIVE Orchestrator. Your job is to manage the user session, understand their goals, and coordinate other agents (PM, Dev) to achieve them. You also handle general chat and tool usage.',
    100,
    '{}',
    '# Orchestrator\nThe central brain of the HIVE.',
    'Manages user interactions and coordinates the swarm.'
) 
on conflict (agent_id) do nothing;
