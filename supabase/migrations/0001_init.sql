-- zone: personal account data sync (desktop <-> web).
-- Single-tenant-per-user design: every row belongs to exactly one
-- auth.users row, RLS is simply `user_id = auth.uid()` everywhere. No
-- organization/team concept -- that's a different product, not this one.

create extension if not exists "pgcrypto";

create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  estimated_minutes int,
  actual_minutes int not null default 0,
  position int not null default 0,
  updated_at timestamptz not null default now()
);

create index todos_user_id_idx on todos (user_id);

create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  start_minutes int not null check (start_minutes >= 0 and start_minutes < 1440),
  duration_minutes int not null check (duration_minutes > 0),
  title text not null,
  todo_id uuid references todos (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index schedule_blocks_user_date_idx on schedule_blocks (user_id, date);

create table focus_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes int not null check (duration_minutes >= 0 and duration_minutes <= 1440),
  interruptions_blocked int not null default 0 check (interruptions_blocked >= 0),
  mode text not null check (mode in ('simple', 'pomodoro'))
);

create index focus_history_user_id_idx on focus_history (user_id, started_at);

-- One row per user. Deliberately does NOT include blockedApps/blockedSites
-- or BGM preferences -- those are device-local only (see plan notes).
create table user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_total_minutes int not null default 25,
  pomodoro jsonb not null default '{"workMinutes":25,"breakMinutes":5,"longBreakMinutes":15,"cyclesBeforeLongBreak":4}',
  idle_nudge_minutes int not null default 5,
  updated_at timestamptz not null default now()
);

alter table todos enable row level security;
alter table schedule_blocks enable row level security;
alter table focus_history enable row level security;
alter table user_settings enable row level security;

create policy todos_owner_all on todos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy schedule_blocks_owner_all on schedule_blocks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy focus_history_owner_all on focus_history
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_settings_owner_all on user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
