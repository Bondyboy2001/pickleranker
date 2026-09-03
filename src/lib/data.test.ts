import { beforeAll, describe, expect, it } from 'vitest'
import {
  dbToMatch,
  dbToPlayer,
  ensureSeedData,
  matchContentKey,
  parseImportedData,
  validatePlayerInput,
  validateScores,
} from './data'

beforeAll(async () => {
  // Seed remapping (legacy name -> canonical id) needs the lazily-loaded seed.
  await ensureSeedData()
})

describe('imported data', () => {
  it('remaps matches when an imported player matches a seeded player by name', () => {
    const imported = parseImportedData(
      JSON.stringify({
        players: [
          { id: 'legacy-ben', name: 'Ben Gillespie', skillLevel: 1 },
          { id: 'custom-2', name: 'Custom Two', skillLevel: 2 },
          { id: 'custom-3', name: 'Custom Three', skillLevel: 3 },
          { id: 'custom-4', name: 'Custom Four', skillLevel: 4 },
        ],
        matches: [
          {
            id: 'custom-match',
            week: 'custom-week',
            playedOn: '2026-07-30',
            teamA: ['legacy-ben', 'custom-2'],
            teamB: ['custom-3', 'custom-4'],
            scoreA: 11,
            scoreB: 8,
          },
        ],
      }),
    )

    expect(imported).not.toHaveProperty('error')
    if ('error' in imported) return

    const match = imported.matches.find(({ id }) => id === 'custom-match')
    expect(match?.teamA).toEqual(['p-ben-gillespie', 'custom-2'])
    expect(imported.players.some(({ id }) => id === 'legacy-ben')).toBe(false)
  })

  it('rejects invalid player and match shapes', () => {
    expect(validatePlayerInput('', 3)).toBeTruthy()
    expect(validatePlayerInput('x'.repeat(65), 3)).toBeTruthy()
    expect(validatePlayerInput('Ana', 99)).toBeTruthy()
    expect(validatePlayerInput('Ana', 3)).toBeNull()
    expect(validateScores(11, 11)).toBeTruthy()
    expect(validateScores(31, 5)).toBeTruthy()
    expect(validateScores(11, 6)).toBeNull()

    const bad = parseImportedData(
      JSON.stringify({
        players: [{ id: 'p1', name: 'A', skillLevel: 3 }],
        matches: [
          {
            id: 'm1',
            week: 'w',
            playedOn: '2026-01-01',
            teamA: ['p1', 'p1'],
            teamB: ['p2', 'p3'],
            scoreA: 11,
            scoreB: 11,
          },
        ],
      }),
    )
    expect(bad).toHaveProperty('error')
  })

  it('includes week and tournament position in the dedupe key', () => {
    const base = {
      id: 'm',
      week: 'Results 01-01-2026',
      playedOn: '2026-01-01',
      teamA: ['a', 'b'] as [string, string],
      teamB: ['c', 'd'] as [string, string],
      scoreA: 11,
      scoreB: 6,
    }
    expect(matchContentKey(base)).not.toBe(
      matchContentKey({ ...base, week: 'Results 08-01-2026', playedOn: '2026-01-08' }),
    )
    expect(matchContentKey(base)).not.toBe(
      matchContentKey({ ...base, round: 2, source: 'tournament' as const }),
    )
  })

  it('preserves imported flags from the database so history stays frozen', () => {
    const player = dbToPlayer({ id: 'p1', name: 'Ana', skill_level: 3.5, imported_rating: 3.904 })
    expect(player.importedRating).toBeCloseTo(3.904, 3)
    expect(dbToPlayer({ id: 'p2', name: 'Bo', skill_level: 3 }).importedRating).toBeUndefined()

    const match = dbToMatch({
      id: 'm1',
      week: 'Results 01-01-2026',
      played_on: '2026-01-01',
      team_a1: 'a',
      team_a2: 'b',
      team_b1: 'c',
      team_b2: 'd',
      score_a: 11,
      score_b: 6,
      imported: true,
    })
    expect(match.imported).toBe(true)
    expect(
      dbToMatch({
        id: 'm2',
        week: 'w',
        played_on: '2026-01-02',
        team_a1: 'a',
        team_a2: 'b',
        team_b1: 'c',
        team_b2: 'd',
        score_a: 11,
        score_b: 6,
      }).imported,
    ).toBeUndefined()
  })
})
