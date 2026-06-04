create table if not exists public.veille_meta_ads (
  id bigserial primary key,
  image_hash text not null unique,
  source_platform text not null default 'Meta',
  import_source text not null default 'firecrawl_manual',
  school_id text not null,
  school_name text not null,
  tag text,
  original_image_url text not null,
  image_url text not null,
  storage_bucket text,
  storage_path text,
  source_url text,
  ad_library_url text,
  source_file text,
  ordinal integer,
  captured_at timestamptz not null,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists veille_meta_ads_school_id_idx on public.veille_meta_ads (school_id);
create index if not exists veille_meta_ads_imported_at_idx on public.veille_meta_ads (imported_at desc);
