-- Optional migration for existing Supabase projects.
-- Adds tournament round/court position to matches so the results view can group
-- past tournaments by round and order courts 1→4. Both are nullable; non-
-- tournament / older matches simply leave them empty.
alter table public.matches
  add column if not exists round integer;

alter table public.matches
  add column if not exists court integer;
