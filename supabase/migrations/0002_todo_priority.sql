alter table todos
  add column if not exists priority text check (priority in ('high', 'medium', 'low'));
