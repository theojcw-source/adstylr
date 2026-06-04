alter table public.generations
  add column if not exists thumbnail_url text;
