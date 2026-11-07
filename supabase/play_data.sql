-- Play data for Wurst Case Scenario (see src/state/playDataSync.ts).
-- Run this once in the game's own Supabase project (SQL editor), never in a project that holds other data.
--
-- The game (anon / publishable key) may only INSERT, within size limits. Nobody can read, change or
-- delete rows through the API; read them in the dashboard or with SQL (service role / postgres).

create table if not exists public.play_runs (
  id uuid primary key,
  player uuid not null,
  at timestamptz not null,
  received_at timestamptz not null default now(),
  build text not null,
  outcome text not null,
  sausage text not null,
  chili smallint not null default 0,
  wave smallint not null,
  course smallint not null,
  time_sec integer not null,
  kills integer not null,
  damage_dealt integer not null,
  damage_taken integer not null,
  cause_of_death text,
  data jsonb not null,
  constraint play_runs_sizes check (
    octet_length(data::text) < 200000
    and length(build) < 64 and length(outcome) < 16 and length(sausage) < 32
    and coalesce(length(cause_of_death), 0) < 128
  )
);

create table if not exists public.play_errors (
  id uuid primary key,
  player uuid not null,
  at timestamptz not null,
  received_at timestamptz not null default now(),
  build text not null,
  message text not null,
  stack text,
  scene text,
  wave smallint,
  constraint play_errors_sizes check (
    length(message) <= 500 and coalesce(length(stack), 0) <= 2000
    and length(build) < 64 and coalesce(length(scene), 0) < 200
  )
);

create index if not exists play_runs_at on public.play_runs (at);
create index if not exists play_runs_build on public.play_runs (build);
create index if not exists play_errors_at on public.play_errors (at);

alter table public.play_runs enable row level security;
alter table public.play_errors enable row level security;

revoke all on public.play_runs, public.play_errors from anon, authenticated;
grant insert on public.play_runs, public.play_errors to anon;

drop policy if exists "game can add runs" on public.play_runs;
create policy "game can add runs" on public.play_runs for insert to anon
  with check (at > now() - interval '120 days' and at < now() + interval '1 day');

drop policy if exists "game can add errors" on public.play_errors;
create policy "game can add errors" on public.play_errors for insert to anon
  with check (at > now() - interval '120 days' and at < now() + interval '1 day');

-- Handy views for looking at the data (not exposed to the game).
create or replace view public.play_deaths_by_cause with (security_invoker = true) as
  select build, cause_of_death, count(*) as deaths, round(avg(wave), 1) as avg_wave
  from public.play_runs where outcome = 'death'
  group by build, cause_of_death order by deaths desc;

create or replace view public.play_link_dps with (security_invoker = true) as
  select r.build, l->>'weapon' as weapon, count(*) as links,
         round(avg((l->>'dps')::numeric), 1) as avg_dps, round(avg((l->>'damage')::numeric)) as avg_damage
  from public.play_runs r, jsonb_array_elements(r.data->'links') l
  group by r.build, l->>'weapon' order by avg_dps desc;

create or replace view public.play_crashes with (security_invoker = true) as
  select build, count(*) filter (where outcome = 'crashed') as crashed, count(*) as runs
  from public.play_runs group by build order by build desc;
revoke all on public.play_deaths_by_cause, public.play_link_dps, public.play_crashes from anon, authenticated;
