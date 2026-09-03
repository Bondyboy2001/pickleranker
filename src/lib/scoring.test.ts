import { describe, expect, it } from 'vitest'
import { calculateMatch, probabilityForTeam, roundRating } from './scoring'
import { buildStandings } from './standings'
import type { AppData } from './types'

type TestMatch = Parameters<typeof calculateMatch>[0]

// Replays a sequence of games through the rating engine, mutating `ratings`
// exactly the way buildStandings does, so we can assert end-state ratings.
function replay(matches: TestMatch[], ratings: Map<string, number>) {
  return matches.map((match) => {
    const summary = calculateMatch(match, ratings)
    match.teamA.forEach((id) =>
      ratings.set(id, roundRating((ratings.get(id) ?? 3) + summary.teamADelta)),
    )
    match.teamB.forEach((id) =>
      ratings.set(id, roundRating((ratings.get(id) ?? 3) + summary.teamBDelta)),
    )
    return summary
  })
}

describe('probabilityForTeam', () => {
  it('is 50% for evenly matched teams', () => {
    expect(probabilityForTeam(3.0, 3.0)).toBeCloseTo(0.5, 3)
  })

  it('scales with the rating gap (×2)', () => {
    expect(probabilityForTeam(3.005, 3.0)).toBeCloseTo(0.51, 3)
    expect(probabilityForTeam(3.0, 3.005)).toBeCloseTo(0.49, 3)
  })

  it('clamps to [0, 1]', () => {
    expect(probabilityForTeam(4.0, 3.0)).toBe(1)
    expect(probabilityForTeam(3.0, 4.0)).toBe(0)
  })
})

describe('calculateMatch — documented examples', () => {
  it('matches the 4DR doc for a clean win between equal teams', () => {
    const ratings = new Map<string, number>()
    const [game] = replay(
      [
        {
          id: 'g1',
          week: 'Doc',
          playedOn: '2026-01-01',
          teamA: ['p1', 'p2'],
          teamB: ['p3', 'p4'],
          scoreA: 11,
          scoreB: 6,
        },
      ],
      ratings,
    )

    expect(game.teamAStart).toBeCloseTo(3.0, 3)
    expect(game.teamBStart).toBeCloseTo(3.0, 3)
    expect(game.baseDelta).toBeCloseTo(0.05, 3)
    expect(game.teamADelta).toBeCloseTo(0.055, 3) // base + margin (5 × 0.001)
    expect(game.teamBDelta).toBeCloseTo(-0.044, 3) // -base + loser credit (6 × 0.001)
    expect(ratings.get('p1')).toBeCloseTo(3.055, 3)
    expect(ratings.get('p3')).toBeCloseTo(2.956, 3)
  })

  it('applies an upset bonus when the underdog wins', () => {
    const ratings = new Map<string, number>([
      ['p1', 3.006],
      ['p3', 3.006],
      ['p5', 3.0],
      ['p6', 3.0],
    ])
    const [game] = replay(
      [
        {
          id: 'g2',
          week: 'Doc',
          playedOn: '2026-01-08',
          teamA: ['p1', 'p3'],
          teamB: ['p5', 'p6'],
          scoreA: 10,
          scoreB: 11,
        },
      ],
      ratings,
    )

    expect(game.teamAStart).toBeCloseTo(3.006, 3)
    expect(game.winner).toBe('B')
    expect(game.baseDelta).toBeCloseTo(0.051, 3)
    expect(game.teamBDelta).toBeCloseTo(0.052, 3)
    expect(game.teamADelta).toBeCloseTo(-0.041, 3)
  })
})

describe('calculateMatch — invariants', () => {
  it('gives the winner a strictly positive and the loser a non-positive delta for equal teams', () => {
    const summary = calculateMatch(
      {
        id: 'g',
        week: 'w',
        playedOn: '2026-02-01',
        teamA: ['a', 'b'],
        teamB: ['c', 'd'],
        scoreA: 11,
        scoreB: 9,
      },
      new Map(),
    )
    expect(summary.teamADelta).toBeGreaterThan(0)
    expect(summary.teamBDelta).toBeLessThanOrEqual(0)
  })

  it('rewards a bigger winning margin more', () => {
    const blowout = calculateMatch(
      { id: '1', week: 'w', playedOn: 'd', teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 0 },
      new Map(),
    )
    const squeaker = calculateMatch(
      { id: '2', week: 'w', playedOn: 'd', teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 11, scoreB: 9 },
      new Map(),
    )
    expect(blowout.teamADelta).toBeGreaterThan(squeaker.teamADelta)
  })

  it('defaults unrated players to 3.0', () => {
    const summary = calculateMatch(
      { id: '1', week: 'w', playedOn: 'd', teamA: ['x', 'y'], teamB: ['z', 'w'], scoreA: 11, scoreB: 5 },
      new Map(),
    )
    expect(summary.teamAStart).toBe(3)
    expect(summary.teamBStart).toBe(3)
  })
})

describe('buildStandings', () => {
  const data: AppData = {
    players: [
      { id: 'p1', name: 'Ana', skillLevel: 3 },
      { id: 'p2', name: 'Ben', skillLevel: 3 },
      { id: 'p3', name: 'Cara', skillLevel: 3 },
      { id: 'p4', name: 'Dan', skillLevel: 3 },
    ],
    matches: [
      {
        id: 'm1',
        week: 'Week 1',
        playedOn: '2026-01-01',
        teamA: ['p1', 'p2'],
        teamB: ['p3', 'p4'],
        scoreA: 11,
        scoreB: 6,
      },
    ],
  }

  it('tracks wins, losses, games and points for each player', () => {
    const { standings } = buildStandings(data)
    const ana = standings.find((s) => s.id === 'p1')!
    const cara = standings.find((s) => s.id === 'p3')!
    expect(ana.wins).toBe(1)
    expect(ana.losses).toBe(0)
    expect(ana.games).toBe(1)
    expect(ana.pointsFor).toBe(11)
    expect(ana.pointsAgainst).toBe(6)
    expect(cara.wins).toBe(0)
    expect(cara.losses).toBe(1)
  })

  it('ranks winners above losers by rating', () => {
    const { standings } = buildStandings(data)
    expect(standings[0].rating).toBeGreaterThan(standings[standings.length - 1].rating)
    expect(standings[0].id === 'p1' || standings[0].id === 'p2').toBe(true)
  })

  it('moves ratings for imported matches — every game counts', () => {
    const importedData: AppData = {
      players: data.players,
      matches: [{ ...data.matches[0], id: 'm-imp', imported: true }],
    }
    const { standings } = buildStandings(importedData)
    // Same result as a non-imported game: winners gain, losers lose.
    expect(standings.find((s) => s.id === 'p1')!.wins).toBe(1)
    expect(standings.find((s) => s.id === 'p1')!.rating).toBeCloseTo(3.055, 3)
    expect(standings.find((s) => s.id === 'p3')!.rating).toBeCloseTo(2.956, 3)
  })
})
