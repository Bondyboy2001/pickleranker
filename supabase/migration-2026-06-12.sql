-- Optional migration for existing Supabase projects
alter table public.matches
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.tournament_drafts (
  id text primary key default 'default',
  data jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tournament_drafts enable row level security;

drop policy if exists "Tournament drafts are admin-only" on public.tournament_drafts;
create policy "Tournament drafts are admin-only"
on public.tournament_drafts for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
