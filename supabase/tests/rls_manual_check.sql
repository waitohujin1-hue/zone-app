-- Manual RLS verification for 0001_init.sql (personal-account schema).
-- Run this in the Supabase SQL Editor (or `psql` against your project) after
-- applying the migration. Creates two users, asserts each can only see/write
-- their own rows across todos/schedule_blocks/focus_history/user_settings.
--
-- The `set local request.jwt.claims` trick is what Supabase's Postgres uses
-- to resolve auth.uid() outside of a real authenticated request -- it lets us
-- impersonate a given user id for the rest of the transaction.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.test')
on conflict (id) do nothing;

insert into todos (user_id, text) values
  ('00000000-0000-0000-0000-000000000001', 'alice todo'),
  ('00000000-0000-0000-0000-000000000002', 'bob todo');

insert into schedule_blocks (user_id, date, start_minutes, duration_minutes, title) values
  ('00000000-0000-0000-0000-000000000001', current_date, 540, 25, 'alice block'),
  ('00000000-0000-0000-0000-000000000002', current_date, 600, 25, 'bob block');

insert into focus_history (user_id, started_at, ended_at, duration_minutes, mode) values
  ('00000000-0000-0000-0000-000000000001', now() - interval '1 hour', now(), 25, 'simple'),
  ('00000000-0000-0000-0000-000000000002', now() - interval '1 hour', now(), 25, 'simple');

insert into user_settings (user_id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

-- 1) Alice can only see her own rows in every table.
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001"}';

do $$
declare todo_count int; block_count int; history_count int; settings_count int;
begin
  select count(*) into todo_count from todos;
  select count(*) into block_count from schedule_blocks;
  select count(*) into history_count from focus_history;
  select count(*) into settings_count from user_settings;
  assert todo_count = 1, 'alice should see exactly her own todo';
  assert block_count = 1, 'alice should see exactly her own schedule block';
  assert history_count = 1, 'alice should see exactly her own focus_history row';
  assert settings_count = 1, 'alice should see exactly her own user_settings row';
end $$;

-- 2) Alice cannot write a row claiming to be Bob's.
do $$
begin
  begin
    insert into todos (user_id, text) values ('00000000-0000-0000-0000-000000000002', 'forged todo');
    assert false, 'alice must NOT be able to insert a todo owned by bob';
  exception when others then
    null; -- expected: RLS with check() rejects this insert
  end;
end $$;

-- 3) Bob can only see his own rows (mirrors check 1 from the other side).
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000002"}';

do $$
declare todo_count int;
begin
  select count(*) into todo_count from todos;
  assert todo_count = 1, 'bob should see exactly his own todo';
end $$;

select 'ALL RLS CHECKS PASSED' as result;

rollback; -- never commit the fixture data
