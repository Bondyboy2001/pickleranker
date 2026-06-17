import { describe, expect, it } from 'vitest'
import {
  buildNextRound,
  createTournament,
  rebuildRoundsAfter,
  type TournamentGame,
  type TournamentState,
} from './tournament'

function game(
  teamA: [string, string],
  teamB: [string, string],
  scoreA: string,
  scoreB: string,
): TournamentGame {
  return { id: `${teamA.join('-')}-vs-${teamB.join('-')}`, teamA, teamB, scoreA, scoreB }
}

describe('buildNextRound promotion/relegation', () => {
  it('keeps each court at four players and maps top/bottom two correctly (16 players)', () => {
    const playerIds = Array.from({ length: 16 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-06-17')

    // Round 1 courts are seeded: court i = [p4i, p4i+1, p4i+2, p4i+3].
    const round1 = state.rounds[0]
    expect(round1.courts).toHaveLength(4)
    round1.courts.forEach((court, index) => {
      expect(court.playerIds).toEqual([
        `p${index * 4}`,
        `p${index * 4 + 1}`,
        `p${index * 4 + 2}`,
        `p${index * 4 + 3}`,
      ])
    })

    // With no scores entered, ranking falls back to seed order, so top two of
    // each court are its first two seeds and bottom two are the last two.
    const next = buildNextRound(state)
    const courts = next.rounds[1].courts

    expect(courts).toHaveLength(4)
    // Court 1: top two of court 1 stay + top two of court 2 promoted.
    expect(courts[0].playerIds).toEqual(['p0', 'p1', 'p4', 'p5'])
    // Court 2: bottom two of court 1 relegated + top two of court 3 promoted.
    expect(courts[1].playerIds).toEqual(['p2', 'p3', 'p8', 'p9'])
    // Court 3: bottom two of court 2 relegated + top two of court 4 promoted.
    expect(courts[2].playerIds).toEqual(['p6', 'p7', 'p12', 'p13'])
    // Court 4: bottom two of court 3 relegated + bottom two of court 4 stay.
    expect(courts[3].playerIds).toEqual(['p10', 'p11', 'p14', 'p15'])
  })

  it('promotes the in-court winner regardless of seed and breaks ties by seed', () => {
    // Court 1 players p0..p3; results make p2 (3rd seed) the clear winner, with
    // p0/p1/p3 tied on wins and point diff so seed order decides them.
    const court1Games = [
      game(['p0', 'p1'], ['p2', 'p3'], '5', '11'), // p2,p3 win
      game(['p0', 'p2'], ['p1', 'p3'], '11', '5'), // p0,p2 win
      game(['p0', 'p3'], ['p1', 'p2'], '5', '11'), // p1,p2 win
    ]
    // Court 2 players p4..p7 with no scores -> seed order.
    const court2Games = [
      game(['p4', 'p5'], ['p6', 'p7'], '', ''),
      game(['p4', 'p6'], ['p5', 'p7'], '', ''),
      game(['p4', 'p7'], ['p5', 'p6'], '', ''),
    ]

    const state: TournamentState = {
      playedOn: '2026-06-17',
      playerIds: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
      satOutCounts: {},
      rounds: [
        {
          round: 1,
          sitOutIds: [],
          courts: [
            { court: 1, playerIds: ['p0', 'p1', 'p2', 'p3'], games: court1Games },
            { court: 2, playerIds: ['p4', 'p5', 'p6', 'p7'], games: court2Games },
          ],
        },
      ],
    }

    const next = buildNextRound(state)
    const courts = next.rounds[1].courts

    // Court 1 finish: [p2, p0, p1, p3] -> top two p2,p0 stay; bottom two p1,p3 drop.
    // Court 2 finish (seed): top two p4,p5 promote; bottom two p6,p7 stay.
    expect(courts[0].playerIds).toEqual(['p2', 'p0', 'p4', 'p5'])
    expect(courts[1].playerIds).toEqual(['p1', 'p3', 'p6', 'p7'])
  })

  it('keeps the original seed order stable across rounds', () => {
    const playerIds = Array.from({ length: 16 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-06-17')
    const next = buildNextRound(state)
    expect(next.playerIds).toEqual(playerIds)
  })
})

describe('rebuildRoundsAfter', () => {
  it('keeps earlier rounds and regenerates the same number of later rounds', () => {
    const playerIds = Array.from({ length: 16 }, (_, index) => `p${index}`)
    let state = createTournament(playerIds, '2026-06-17')
    state = buildNextRound(state)
    state = buildNextRound(state)
    expect(state.rounds).toHaveLength(3)

    const rebuilt = rebuildRoundsAfter(state, 0)
    expect(rebuilt.rounds).toHaveLength(3)
    // Round 1 is untouched.
    expect(rebuilt.rounds[0]).toEqual(state.rounds[0])
    // With no scores, later rounds regenerate deterministically by seed.
    expect(rebuilt.rounds[1].courts.map((c) => c.playerIds)).toEqual(
      state.rounds[1].courts.map((c) => c.playerIds),
    )
    expect(rebuilt.rounds[2].courts.map((c) => c.playerIds)).toEqual(
      state.rounds[2].courts.map((c) => c.playerIds),
    )
  })

  it('propagates an edited round into the following round', () => {
    // Court 1 (p0..p3) left unscored -> seed order. Court 2 (p4..p7) scored so
    // p6 and p7 win every game and become the promoted pair.
    const round1 = {
      round: 1,
      sitOutIds: [],
      courts: [
        {
          court: 1,
          playerIds: ['p0', 'p1', 'p2', 'p3'],
          games: [
            game(['p0', 'p1'], ['p2', 'p3'], '', ''),
            game(['p0', 'p2'], ['p1', 'p3'], '', ''),
            game(['p0', 'p3'], ['p1', 'p2'], '', ''),
          ],
        },
        {
          court: 2,
          playerIds: ['p4', 'p5', 'p6', 'p7'],
          games: [
            game(['p6', 'p7'], ['p4', 'p5'], '11', '0'),
            game(['p6', 'p7'], ['p4', 'p5'], '11', '0'),
            game(['p6', 'p7'], ['p4', 'p5'], '11', '0'),
          ],
        },
      ],
    }
    // A stale round 2 just needs to exist so there is a later round to rebuild.
    const staleRound2 = {
      round: 2,
      sitOutIds: [],
      courts: [
        { court: 1, playerIds: ['p0', 'p1', 'p4', 'p5'], games: [] },
        { court: 2, playerIds: ['p2', 'p3', 'p6', 'p7'], games: [] },
      ],
    }
    const state: TournamentState = {
      playedOn: '2026-06-17',
      playerIds: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
      satOutCounts: {},
      rounds: [round1, staleRound2],
    }

    const rebuilt = rebuildRoundsAfter(state, 0)
    expect(rebuilt.rounds).toHaveLength(2)
    // Court 1: top two of court 1 (p0,p1) + promoted top two of court 2 (p6,p7).
    expect(rebuilt.rounds[1].courts[0].playerIds).toEqual(['p0', 'p1', 'p6', 'p7'])
    // Court 2: bottom two of court 1 (p2,p3) + relegated bottom two of court 2 (p4,p5).
    expect(rebuilt.rounds[1].courts[1].playerIds).toEqual(['p2', 'p3', 'p4', 'p5'])
  })
})
