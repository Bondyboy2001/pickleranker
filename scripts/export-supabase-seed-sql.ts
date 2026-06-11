import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cardiffSeedData } from '../src/data/cardiffSeed'

type SeedPlayer = {
  id: string
  name: string
  skillLevel: number
  importedRating?: number
  importedRank?: number
  importedMovement?: string
}

type SeedMatch = {
  id: string
  week: string
  playedOn: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number
  scoreB: number
  imported?: boolean
}

function sql(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${value.replace(/'/g, "''")}'`
}

const data = cardiffSeedData as {
  players: SeedPlayer[]
  matches: SeedMatch[]
}

const playerRows = data.players
  .map(
    (player) =>
      `(${sql(player.id)}, ${sql(player.name)}, ${sql(player.skillLevel)}, ${sql(player.importedRating)}, ${sql(player.importedRank)}, ${sql(player.importedMovement)})`,
  )
  .join(',\n')

const matchRows = data.matches
  .map(
    (match) =>
      `(${sql(match.id)}, ${sql(match.week)}, ${sql(match.playedOn)}, ${sql(match.teamA[0])}, ${sql(match.teamA[1])}, ${sql(match.teamB[0])}, ${sql(match.teamB[1])}, ${sql(match.scoreA)}, ${sql(match.scoreB)}, ${sql(Boolean(match.imported))})`,
  )
  .join(',\n')

const output = `insert into public.players (id, name, skill_level, imported_rating, imported_rank, imported_movement)
values
${playerRows}
on conflict (id) do update set
  name = excluded.name,
  skill_level = excluded.skill_level,
  imported_rating = excluded.imported_rating,
  imported_rank = excluded.imported_rank,
  imported_movement = excluded.imported_movement;

insert into public.matches (id, week, played_on, team_a1, team_a2, team_b1, team_b2, score_a, score_b, imported)
values
${matchRows}
on conflict (id) do update set
  week = excluded.week,
  played_on = excluded.played_on,
  team_a1 = excluded.team_a1,
  team_a2 = excluded.team_a2,
  team_b1 = excluded.team_b1,
  team_b2 = excluded.team_b2,
  score_a = excluded.score_a,
  score_b = excluded.score_b,
  imported = excluded.imported;
`

await writeFile(resolve('supabase/seed-cardiff.sql'), output)
console.log(`Wrote ${data.players.length} players and ${data.matches.length} matches to supabase/seed-cardiff.sql`)
