-- Add thread_id to ops_inbox for email thread deduplication
alter table ops_inbox add column if not exists thread_id text;
create index if not exists ops_inbox_thread_id_idx on ops_inbox (agent_id, thread_id) where thread_id is not null;
