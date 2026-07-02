import { describe, expect, it } from 'vitest'
import { buildStandings, buildWeeklyStandings } from './standings'
import type { AppData } from './types'

describe('buildWeeklyStandings', () => {
  it('uses snapshot movement as weekly rank movement', () => {
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
      weeklySnapshots: [
        {
          key: '2026-06-17',
          label: '17-06-2026',
          playedOn: '2026-06-17',
          players: [
            { playerId: 'gruff', name: 'Gruff Huws', rank: 1, rating: 3.2, movement: '-' },
            { playerId: 'harry', name: 'Harry Bond', rank: 2, rating: 3.1, movement: '-' },
          ],
        },
        {
          key: '2026-06-24',
          label: '24-06-2026',
          playedOn: '2026-06-24',
          players: [
            { playerId: 'harry', name: 'Harry Bond', rank: 1, rating: 3.3, movement: '+1' },
            { playerId: 'gruff', name: 'Gruff Huws', rank: 2, rating: 3.15, movement: '-1' },
          ],
        },
      ],
    }
    const { summaries } = buildStandings(data)

    const standings = buildWeeklyStandings(
      '2026-06-24',
      summaries,
      data.players,
      data.matches,
      data.weeklySnapshots,
    )
    const harry = standings.find((player) => player.playerId === 'harry')

    expect(harry?.rank).toBe(1)
    expect(harry?.rankMovement).toBe(1)
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

    expect(harry?.rank).toBe(1)
    expect(harry?.rankMovement).toBe(1)
  })
})
