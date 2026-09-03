import { describe, expect, it } from 'vitest'
import {
  buildOverallRankMovement,
  buildStandings,
  buildWeeklyStandings,
  sortStandings,
  sortWeeklyStandings,
} from './standings'
import type { AppData, PlayerStanding, WeeklyStanding } from './types'

describe('buildOverallRankMovement', () => {
  const players = [
    { id: 'harry', name: 'Harry Bond', skillLevel: 3.05 },
    { id: 'gruff', name: 'Gruff Huws', skillLevel: 3 },
    { id: 'ben', name: 'Ben Gillespie', skillLevel: 2.5 },
    { id: 'dan', name: 'Dan Jones', skillLevel: 2.5 },
  ]

  function match(id: string, playedOn: string, scoreA: number, scoreB: number) {
    return {
      id,
      week: `Results ${playedOn}`,
      playedOn,
      teamA: ['harry', 'ben'] as [string, string],
      teamB: ['gruff', 'dan'] as [string, string],
      scoreA,
      scoreB,
    }
  }

  it('compares against the previous playing week, not the last snapshot', () => {
    const data: AppData = {
      players,
      matches: [match('m1', '2026-06-24', 5, 11), match('m2', '2026-07-01', 11, 3)],
      weeklySnapshots: [
        {
          key: '2026-06-17',
          label: '17-06-2026',
          playedOn: '2026-06-17',
          players: [
            { playerId: 'harry', name: 'Harry Bond', rank: 1, rating: 3.05, movement: '-' },
            { playerId: 'gruff', name: 'Gruff Huws', rank: 2, rating: 3, movement: '-' },
            { playerId: 'ben', name: 'Ben Gillespie', rank: 3, rating: 2.5, movement: '-' },
            { playerId: 'dan', name: 'Dan Jones', rank: 4, rating: 2.5, movement: '-' },
          ],
        },
      ],
    }
    const { standings } = buildStandings(data)
    const movement = buildOverallRankMovement(data, standings)

    // Everyone starts at 3.0, so after 24 June the order is alphabetical
    // (Ben, Dan, Gruff, Harry). Harry climbs back on 1 July: up two, Gruff
    // down two.
    expect(movement.get('harry')).toBe(2)
    expect(movement.get('gruff')).toBe(-2)
    // Movement is a permutation of rank changes, so it always nets out to zero.
    expect([...movement.values()].reduce((total, value) => total + value, 0)).toBe(0)
  })

  it('shows no movement for a player who first appeared this week', () => {
    const data: AppData = {
      players: [...players, { id: 'newbie', name: 'New Bie', skillLevel: 3.5 }],
      matches: [
        match('m1', '2026-06-24', 11, 5),
        {
          id: 'm2',
          week: 'Results 2026-07-01',
          playedOn: '2026-07-01',
          teamA: ['newbie', 'ben'] as [string, string],
          teamB: ['gruff', 'dan'] as [string, string],
          scoreA: 11,
          scoreB: 4,
        },
      ],
    }
    const { standings } = buildStandings(data)

    expect(buildOverallRankMovement(data, standings).get('newbie')).toBe(0)
  })

  it('reports no movement until a second week has been played', () => {
    const data: AppData = { players, matches: [match('m1', '2026-06-24', 11, 5)] }
    const { standings } = buildStandings(data)

    expect(buildOverallRankMovement(data, standings).size).toBe(0)
  })

  it('agrees with the leaderboard rebuilt as it stood at the end of last week', () => {
    // The shape the live league actually has: imported history behind a weekly
    // snapshot, then real sessions played on top of it.
    const roster = Array.from({ length: 12 }, (_, index) => ({
      id: `p${index}`,
      name: `Player ${String.fromCharCode(65 + index)}`,
      skillLevel: 3 + (index % 5) * 0.05,
    }))
    const liveWeeks = ['2026-06-17', '2026-06-24', '2026-07-01', '2026-07-08']
    const liveMatches = liveWeeks.flatMap((playedOn, weekIndex) =>
      Array.from({ length: 6 }, (_, index) => {
        const seat = (offset: number) => roster[(index * 2 + offset + weekIndex) % roster.length].id
        return {
          id: `${playedOn}-${index}`,
          week: `Results ${playedOn}`,
          playedOn,
          teamA: [seat(0), seat(1)] as [string, string],
          teamB: [seat(5), seat(8)] as [string, string],
          scoreA: (index + weekIndex) % 3 === 0 ? 11 : 7,
          scoreB: (index + weekIndex) % 3 === 0 ? 4 : 11,
        }
      }).filter((entry) => new Set([...entry.teamA, ...entry.teamB]).size === 4),
    )
    const data: AppData = {
      players: roster,
      matches: [
        {
          id: 'history',
          week: 'Results 2026-06-10',
          playedOn: '2026-06-10',
          teamA: ['p0', 'p1'],
          teamB: ['p2', 'p3'],
          scoreA: 11,
          scoreB: 5,
          imported: true,
        },
        ...liveMatches,
      ],
      weeklySnapshots: [
        {
          key: '2026-06-10',
          label: '10-06-2026',
          playedOn: '2026-06-10',
          players: roster.map((player, index) => ({
            playerId: player.id,
            name: player.name,
            rank: index + 1,
            rating: player.skillLevel,
            movement: '-',
          })),
        },
      ],
    }

    const { standings } = buildStandings(data)
    const movement = buildOverallRankMovement(data, standings)

    // Ground truth: the same standings pipeline run over everything up to the
    // end of the previous session. If the badge ever disagrees with that, it is
    // measuring against something other than last week.
    const lastWeek = liveWeeks[liveWeeks.length - 2]
    const previousRank = new Map(
      buildStandings({
        ...data,
        matches: data.matches.filter((entry) => entry.playedOn <= lastWeek),
      }).standings.map((player, index) => [player.id, index + 1]),
    )

    standings.forEach((player, index) => {
      expect({ name: player.name, movement: movement.get(player.id) }).toEqual({
        name: player.name,
        movement: (previousRank.get(player.id) ?? 0) - (index + 1),
      })
    })
    // Somebody actually moved, or the check above proves nothing.
    expect([...movement.values()].some((value) => value !== 0)).toBe(true)
  })
})

describe('buildWeeklyStandings', () => {
  it('derives rank movement by replaying the week, including early history', () => {
    const data: AppData = {
      players: [
        { id: 'harry', name: 'Harry Bond', skillLevel: 3 },
        { id: 'gruff', name: 'Gruff Huws', skillLevel: 3 },
        { id: 'ben', name: 'Ben Gillespie', skillLevel: 3 },
        { id: 'dan', name: 'Dan Jones', skillLevel: 3 },
      ],
      matches: [
        {
          id: 'm1',
          week: 'Results 2026-06-24',
          playedOn: '2026-06-24',
          teamA: ['harry', 'ben'],
          teamB: ['gruff', 'dan'],
          scoreA: 11,
          scoreB: 8,
          imported: true,
        },
      ],
    }
    const { summaries } = buildStandings(data)

    const standings = buildWeeklyStandings('2026-06-24', summaries, data.players, data.matches)
    const harry = standings.find((player) => player.playerId === 'harry')

    // All tied at 3.0, alphabetical order puts Harry 4th; the 11-8 win lifts
    // Harry and Ben to 3.053, so Harry ends 2nd: movement +2.
    expect(harry?.rank).toBe(2)
    expect(harry?.rankMovement).toBe(2)
  })

  it('calculates rank movement for weeks after the latest snapshot', () => {
    const data: AppData = {
      players: [
        { id: 'harry', name: 'Harry Bond', skillLevel: 3.19 },
        { id: 'gruff', name: 'Gruff Huws', skillLevel: 3.2 },
        { id: 'ben', name: 'Ben Gillespie', skillLevel: 3 },
        { id: 'dan', name: 'Dan Jones', skillLevel: 3 },
      ],
      matches: [
        {
          id: 'm1',
          week: 'Results 2026-06-24',
          playedOn: '2026-06-24',
          teamA: ['harry', 'ben'],
          teamB: ['gruff', 'dan'],
          scoreA: 11,
          scoreB: 5,
        },
      ],
    }
    const { summaries } = buildStandings(data)

    const standings = buildWeeklyStandings(
      '2026-06-24',
      summaries,
      data.players,
      data.matches,
    )
    const harry = standings.find((player) => player.playerId === 'harry')

    // All start at 3.0 (alphabetical: Harry 4th); the 11-5 win lifts Harry and
    // Ben to 3.056, so Harry ends 2nd: movement +2.
    expect(harry?.rank).toBe(2)
    expect(harry?.rankMovement).toBe(2)
  })
})

describe('sortStandings', () => {
  function standing(overrides: Partial<PlayerStanding> & { id: string }): PlayerStanding {
    return {
      name: overrides.id,
      skillLevel: 3,
      rating: 3,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      ...overrides,
    }
  }

  // The table arrives already in rank order, so "rank" means the incoming
  // position rather than any field on the row.
  const standings = [
    standing({ id: 'first', rating: 4, wins: 2, losses: 8, games: 10, pointsFor: 50, pointsAgainst: 90 }),
    standing({ id: 'second', rating: 3, wins: 6, losses: 2, games: 8, pointsFor: 80, pointsAgainst: 60 }),
    standing({ id: 'third', rating: 2, wins: 1, losses: 1, games: 2, pointsFor: 20, pointsAgainst: 18 }),
  ]

  const ids = (rows: PlayerStanding[]) => rows.map((row) => row.id)

  it('sorts by incoming position for rank, and reverses it for descending', () => {
    expect(ids(sortStandings(standings, 'rank', 'asc'))).toEqual(['first', 'second', 'third'])
    expect(ids(sortStandings(standings, 'rank', 'desc'))).toEqual(['third', 'second', 'first'])
  })

  it('sorts by win rate rather than raw wins for record', () => {
    expect(ids(sortStandings(standings, 'record', 'desc'))).toEqual(['second', 'third', 'first'])
  })

  it('sorts by point difference, not points scored', () => {
    expect(ids(sortStandings(standings, 'pointDiff', 'desc'))).toEqual(['second', 'third', 'first'])
  })

  it('falls back to the incoming order when the column ties', () => {
    const tied = [standing({ id: 'a', rating: 3 }), standing({ id: 'b', rating: 3 })]
    expect(ids(sortStandings(tied, 'rating', 'desc'))).toEqual(['a', 'b'])
    expect(ids(sortStandings(tied, 'rating', 'asc'))).toEqual(['a', 'b'])
  })

  it('leaves the input array untouched', () => {
    sortStandings(standings, 'rating', 'desc')
    expect(ids(standings)).toEqual(['first', 'second', 'third'])
  })
})

describe('sortWeeklyStandings', () => {
  function weekly(overrides: Partial<WeeklyStanding> & { playerId: string }): WeeklyStanding {
    return {
      name: overrides.playerId,
      rank: 0,
      rankMovement: 0,
      rating: 3,
      change: 0,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      ...overrides,
    }
  }

  const standings = [
    weekly({ playerId: 'top', rank: 1, change: -0.2, rankMovement: -3 }),
    weekly({ playerId: 'mid', rank: 2, change: 0.5, rankMovement: 2 }),
    weekly({ playerId: 'low', rank: 3, change: 0.1, rankMovement: 0 }),
  ]

  const ids = (rows: WeeklyStanding[]) => rows.map((row) => row.playerId)

  // Unlike the overall table, the weekly table carries a real rank field.
  it('sorts by the rank field, not the incoming position', () => {
    const shuffled = [standings[2], standings[0], standings[1]]
    expect(ids(sortWeeklyStandings(shuffled, 'rank', 'asc'))).toEqual(['top', 'mid', 'low'])
  })

  it('sorts by weekly rating change', () => {
    expect(ids(sortWeeklyStandings(standings, 'weeklyChange', 'desc'))).toEqual(['mid', 'low', 'top'])
  })

  it('sorts by rank movement', () => {
    expect(ids(sortWeeklyStandings(standings, 'rankMovement', 'desc'))).toEqual(['mid', 'low', 'top'])
  })
})
