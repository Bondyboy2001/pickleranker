create table if not exists public.players (
  id text primary key,
  name text not null,
  skill_level numeric not null default 3.0,
  imported_rating numeric,
  imported_rank integer,
  imported_movement text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  week text not null,
  played_on date not null,
  team_a1 text not null references public.players(id) on delete restrict,
  team_a2 text not null references public.players(id) on delete restrict,
  team_b1 text not null references public.players(id) on delete restrict,
  team_b2 text not null references public.players(id) on delete restrict,
  score_a integer not null check (score_a >= 0),
  score_b integer not null check (score_b >= 0),
  imported boolean not null default false,
  created_at timestamptz not null default now(),
  check (score_a <> score_b),
  check (team_a1 <> team_a2),
  check (team_a1 <> team_b1),
  check (team_a1 <> team_b2),
  check (team_a2 <> team_b1),
  check (team_a2 <> team_b2),
  check (team_b1 <> team_b2)
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

create index if not exists matches_played_on_id_idx on public.matches (played_on, id);
create index if not exists matches_team_a1_idx on public.matches (team_a1);
create index if not exists matches_team_a2_idx on public.matches (team_a2);
create index if not exists matches_team_b1_idx on public.matches (team_b1);
create index if not exists matches_team_b2_idx on public.matches (team_b2);
create index if not exists admin_users_user_id_idx on public.admin_users (user_id);

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Admins can read their own admin row" on public.admin_users;
create policy "Admins can read their own admin row"
on public.admin_users for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Players are public" on public.players;
create policy "Players are public"
on public.players for select
to anon, authenticated
using (true);

drop policy if exists "Matches are public" on public.matches;
create policy "Matches are public"
on public.matches for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert players" on public.players;
create policy "Admins can insert players"
on public.players for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update players" on public.players;
create policy "Admins can update players"
on public.players for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete players" on public.players;
create policy "Admins can delete players"
on public.players for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can insert matches" on public.matches;
create policy "Admins can insert matches"
on public.matches for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update matches" on public.matches;
create policy "Admins can update matches"
on public.matches for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete matches" on public.matches;
create policy "Admins can delete matches"
on public.matches for delete
to authenticated
using ((select public.is_admin()));
