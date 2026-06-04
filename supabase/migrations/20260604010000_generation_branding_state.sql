alter table public.generations
  add column if not exists branding_config jsonb,
  add column if not exists hidden_at timestamptz;
