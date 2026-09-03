-- Hardening + tournament source + weekly snapshots.
-- Run after schema.sql / earlier migrations.

-- 1) Player name + rating bounds.
alter table public.players
  drop constraint if exists players_name_length;
alter table public.players
  add constraint players_name_length
  check (char_length(name) between 1 and 64);

alter table public.players
  drop constraint if exists players_skill_range;
alter table public.players
  add constraint players_skill_range
  check (skill_level >= 0 and skill_level <= 5);

-- 2) Score cap (pickleball games rarely pass 30; caps mistyped 100-0).
alter table public.matches
  drop constraint if exists matches_score_cap;
alter table public.matches
  add constraint matches_score_cap
  check (score_a <= 30 and score_b <= 30);

-- 3) Tournament origin. 'tournament' rows can be replaced on re-finish without
-- touching manual games on the same day. Backfill from round, then default.
alter table public.matches
  add column if not exists source text not null default 'manual';

update public.matches
  set source = 'tournament'
  where round is not null and source = 'manual';

alter table public.matches
  drop constraint if exists matches_source_values;
alter table public.matches
  add constraint matches_source_values
  check (source in ('manual', 'tournament'));

-- 4) Weekly snapshots: frozen leaderboard figures per week so history never
-- drifts when the scoring formula changes.
create table if not exists public.weekly_snapshots (
  key text primary key,
  label text not null,
  played_on date not null,
  players jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.weekly_snapshots enable row level security;

drop policy if exists "Snapshots are public" on public.weekly_snapshots;
create policy "Snapshots are public"
on public.weekly_snapshots for select
to anon, authenticated
using (true);

drop policy if exists "Admins can write snapshots" on public.weekly_snapshots;
create policy "Admins can write snapshots"
on public.weekly_snapshots for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- 5) Tournament drafts table (missing on early projects — create it) + size
-- bound (~500KB) to prevent storage abuse.
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

alter table public.tournament_drafts
  drop constraint if exists tournament_drafts_size;
alter table public.tournament_drafts
  add constraint tournament_drafts_size
  check (data is null or pg_column_size(data) < 500000);
