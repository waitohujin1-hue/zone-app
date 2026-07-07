-- Supersedes 0002_todo_priority.sql: priority is a numeric rank (1 = highest
-- priority), not a high/medium/low category. Safe to run whether or not
-- 0002 was ever applied.
alter table todos drop column if exists priority;
alter table todos add column priority integer;
