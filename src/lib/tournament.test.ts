import { describe, expect, it } from 'vitest'
import {
  addTournamentPlayer,
  buildNextRound,
  clampCourtCount,
  createTournament,
  defaultCourtCount,
  normalizeTournamentState,
  rebuildRoundsAfter,
  removeTournamentPlayer,
  roundCourtRankings,
  setTournamentCourts,
  syncGameSitOuts,
  type TournamentGame,
  type TournamentRound,
  type TournamentState,
} from './tournament'

// Every player on court for a given game, across all courts.
function seatsInGame(round: TournamentRound, gameIndex: number): string[] {
  return round.courts.flatMap((court) => [
    ...court.games[gameIndex].teamA,
    ...court.games[gameIndex].teamB,
  ])
}

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
      courtCount: 2,
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

describe('sit-out rotation within a round', () => {
  it('rests a different set of players each game', () => {
    // 14 players: three courts of four with two sitting out each game.
    const playerIds = Array.from({ length: 14 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29')
    const round = state.rounds[0]

    expect(round.courts).toHaveLength(3)
    expect(round.sitOutIds).toEqual([])

    const sitOutsByGame = [0, 1, 2].map(
      (gameIndex) => round.courts[0].games[gameIndex].sitOutIds ?? [],
    )
    sitOutsByGame.forEach((sitOutIds, gameIndex) => {
      expect(sitOutIds).toHaveLength(2)
      // Every court shows the same rest set for that game.
      round.courts.forEach((court) =>
        expect(court.games[gameIndex].sitOutIds).toEqual(sitOutIds),
      )
      // The twelve players left are the ones on court, each exactly once.
      const playing = seatsInGame(round, gameIndex)
      expect(playing).toHaveLength(12)
      expect(new Set(playing).size).toBe(12)
      sitOutIds.forEach((playerId) => expect(playing).not.toContain(playerId))
    })

    // Six different players sit once each across the round — nobody sits twice
    // while someone else has not sat at all.
    const allSitters = sitOutsByGame.flat()
    expect(new Set(allSitters).size).toBe(6)
    expect(state.satOutCounts).toEqual(
      Object.fromEntries(allSitters.map((playerId) => [playerId, 1])),
    )
  })

  it('carries the rotation across rounds so earlier sitters rest last', () => {
    const playerIds = Array.from({ length: 14 }, (_, index) => `p${index}`)
    const state = buildNextRound(createTournament(playerIds, '2026-07-29'))
    const roundOneSitters = new Set(
      [0, 1, 2].flatMap((gameIndex) => state.rounds[0].courts[0].games[gameIndex].sitOutIds ?? []),
    )
    const roundTwoSitters = [0, 1, 2].flatMap(
      (gameIndex) => state.rounds[1].courts[0].games[gameIndex].sitOutIds ?? [],
    )

    expect(roundTwoSitters).toHaveLength(6)
    // Fourteen players, six rests a round: round two rests the eight who have
    // not sat yet before repeating anyone.
    roundTwoSitters.forEach((playerId) => expect(roundOneSitters.has(playerId)).toBe(false))
  })
})

describe('buildNextRound with an uneven field (sit-outs)', () => {
  it('keeps the court ladder so a bottom-court sweeper cannot leapfrog to the top court', () => {
    // 13 players: three courts of four plus one resting (p12). This reproduces
    // the real bug where the field was not a multiple of four — the next round
    // used to be a global reseed on raw wins, so the bottom court (p8..p11) that
    // swept its own easy games jumped onto the top court while the strong top
    // court got relegated. With the court ladder, bottom-court players can only
    // promote one court (to court 2), never straight to court 1.
    const playerIds = Array.from({ length: 13 }, (_, index) => `p${index}`)
    const bottomCourtGames = [
      game(['p8', 'p9'], ['p10', 'p11'], '11', '0'),
      game(['p8', 'p10'], ['p9', 'p11'], '11', '0'),
      game(['p8', 'p11'], ['p9', 'p10'], '11', '0'),
    ]
    const seededGames = (a: number) => [
      game([`p${a}`, `p${a + 1}`], [`p${a + 2}`, `p${a + 3}`], '', ''),
      game([`p${a}`, `p${a + 2}`], [`p${a + 1}`, `p${a + 3}`], '', ''),
      game([`p${a}`, `p${a + 3}`], [`p${a + 1}`, `p${a + 2}`], '', ''),
    ]
    const state: TournamentState = {
      playedOn: '2026-06-24',
      playerIds,
      satOutCounts: { p12: 1 },
      courtCount: 3,
      rounds: [
        {
          round: 1,
          sitOutIds: ['p12'],
          order: playerIds,
          courts: [
            { court: 1, playerIds: ['p0', 'p1', 'p2', 'p3'], games: seededGames(0) },
            { court: 2, playerIds: ['p4', 'p5', 'p6', 'p7'], games: seededGames(4) },
            { court: 3, playerIds: ['p8', 'p9', 'p10', 'p11'], games: bottomCourtGames },
          ],
        },
      ],
    }

    const next = buildNextRound(state)
    const round2 = next.rounds[1]
    const bottomCourt = ['p8', 'p9', 'p10', 'p11']

    // Three courts of four every game, with one player resting each game.
    expect(round2.courts).toHaveLength(3)
    const roundTwoSitters = [0, 1, 2].flatMap(
      (gameIndex) => round2.courts[0].games[gameIndex].sitOutIds ?? [],
    )
    expect(roundTwoSitters).toHaveLength(3)
    ;[0, 1, 2].forEach((gameIndex) => expect(seatsInGame(round2, gameIndex)).toHaveLength(12))

    // The bug: a round-1 bottom-court player must not reach the top court.
    expect(round2.courts[0].playerIds.filter((id) => bottomCourt.includes(id))).toEqual([])
    // The top court is drawn only from round 1's two strongest courts.
    round2.courts[0].playerIds.forEach((id) =>
      expect(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']).toContain(id),
    )

    // Everyone is still accounted for, and the previous rester is back in the field.
    const everyone = new Set(round2.courts.flatMap((court) => court.playerIds))
    expect(everyone.size).toBe(13)
    expect(everyone.has('p12')).toBe(true)
    // p12 rested last round, so the rotation should not rest them again now.
    expect(roundTwoSitters).not.toContain('p12')
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
      courtCount: 2,
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

// A small seeded PRNG so the sweep below is deterministic but not degenerate.
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('generated rounds hold their invariants for every field size', () => {
  for (let fieldSize = 4; fieldSize <= 21; fieldSize += 1) {
    it(`${fieldSize} players over four rounds`, () => {
      const random = seededRandom(fieldSize * 7919)
      const playerIds = Array.from({ length: fieldSize }, (_, index) => `p${index}`)
      const courtCount = Math.floor(fieldSize / 4)
      const sitOutCount = fieldSize % 4
      let state = createTournament(playerIds, '2026-07-29', random)

      for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
        const round = state.rounds[roundIndex]
        expect(round.courts).toHaveLength(courtCount)

        const sitsThisRound = new Map<string, number>()
        round.courts[0].games.forEach((_, gameIndex) => {
          const seats = seatsInGame(round, gameIndex)
          const sitters = round.courts[0].games[gameIndex].sitOutIds ?? []
          // Every court fields four different players, nobody plays twice, and
          // the players not on court are exactly the ones listed as sitting.
          expect(seats).toHaveLength(courtCount * 4)
          expect(new Set(seats).size).toBe(seats.length)
          expect(sitters).toHaveLength(sitOutCount)
          expect([...seats, ...sitters].sort()).toEqual([...playerIds].sort())
          round.courts.forEach((court) =>
            expect(court.games[gameIndex].sitOutIds).toEqual(sitters),
          )
          sitters.forEach((playerId) =>
            sitsThisRound.set(playerId, (sitsThisRound.get(playerId) ?? 0) + 1),
          )
        })

        // Rests stay spread: nobody sits twice in a round while someone else has
        // not sat at all, and the tournament totals never drift apart by more
        // than one rest.
        if (sitOutCount * 3 <= fieldSize) {
          sitsThisRound.forEach((sits) => expect(sits).toBe(1))
        }
        const totals = playerIds.map((playerId) => state.satOutCounts[playerId] ?? 0)
        expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1)
        expect(totals.reduce((sum, sits) => sum + sits, 0)).toBe(
          (roundIndex + 1) * sitOutCount * 3,
        )

        // Score every game, then check the finish groups every player once.
        round.courts.forEach((court) =>
          court.games.forEach((entry) => {
            const aWins = random() < 0.5
            entry.scoreA = aWins ? '11' : String(Math.floor(random() * 10))
            entry.scoreB = aWins ? String(Math.floor(random() * 10)) : '11'
          }),
        )
        const ranked = roundCourtRankings(round, state.playerIds).flat()
        expect(ranked.map((result) => result.playerId).sort()).toEqual([...playerIds].sort())

        state = buildNextRound(state, random)
        expect([...(state.rounds[roundIndex + 1].order ?? [])].sort()).toEqual(
          [...playerIds].sort(),
        )
      }
    })
  }
})

describe('syncGameSitOuts', () => {
  it('moves the rest to whoever is off court after a substitution', () => {
    const playerIds = Array.from({ length: 13 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29', seededRandom(11))
    const round = state.rounds[0]
    const sitting = round.courts[0].games[0].sitOutIds ?? []
    expect(sitting).toHaveLength(1)

    // Sub the resting player into court 1 in place of whoever holds teamA[0].
    const replaced = round.courts[0].games[0].teamA[0]
    const courts = round.courts.map((court, courtIndex) =>
      courtIndex !== 0
        ? court
        : {
            ...court,
            games: court.games.map((game, gameIndex) =>
              gameIndex !== 0
                ? game
                : { ...game, teamA: [sitting[0], game.teamA[1]] as [string, string] },
            ),
          },
    )

    const synced = syncGameSitOuts({ ...round, courts })
    // The substitute is playing and the player they replaced is now resting.
    expect(synced.courts[0].games[0].sitOutIds).toEqual([replaced])
    // Every court shows the same rest set, and later games are untouched.
    synced.courts.forEach((court) => expect(court.games[0].sitOutIds).toEqual([replaced]))
    expect(synced.courts[0].games[1].sitOutIds).toEqual(round.courts[0].games[1].sitOutIds)
  })

  it('leaves rounds rebuilt from saved matches alone', () => {
    const round: TournamentRound = {
      round: 1,
      sitOutIds: [],
      courts: [
        {
          court: 1,
          playerIds: ['p0', 'p1', 'p2', 'p3'],
          games: [game(['p0', 'p1'], ['p2', 'p3'], '11', '5')],
        },
      ],
    }
    expect(syncGameSitOuts(round)).toEqual(round)
  })
})

describe('court count', () => {
  it('defaults to one full court per four players', () => {
    expect(defaultCourtCount(4)).toBe(1)
    expect(defaultCourtCount(11)).toBe(2)
    expect(defaultCourtCount(16)).toBe(4)
    expect(defaultCourtCount(3)).toBe(1)
  })

  it('clamps a picked court count to what the roster can fill', () => {
    expect(clampCourtCount(2, 12)).toBe(2)
    expect(clampCourtCount(99, 8)).toBe(2)
    expect(clampCourtCount(0, 8)).toBe(1)
    expect(clampCourtCount(Number.NaN, 8)).toBe(2)
  })

  it('caps courts below the roster maximum and rotates the extra sitters', () => {
    const playerIds = Array.from({ length: 12 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29', seededRandom(7), 2)
    expect(state.courtCount).toBe(2)

    const round = state.rounds[0]
    expect(round.courts).toHaveLength(2)
    // 12 players on 2 courts: 4 sit out every game, rotating so everyone plays.
    round.courts.forEach((court) => {
      expect(court.games).toHaveLength(3)
      court.games.forEach((game) => {
        expect(game.sitOutIds).toHaveLength(4)
        expect([...game.teamA, ...game.teamB]).toHaveLength(4)
      })
    })
    const seated = new Set(round.courts.flatMap((court) => court.playerIds))
    expect([...seated].sort()).toEqual([...playerIds].sort())
  })

  it('clamps an oversized court count instead of building short courts', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29', seededRandom(7), 99)
    expect(state.courtCount).toBe(2)
    expect(state.rounds[0].courts).toHaveLength(2)
  })

  it('carries the court count through following rounds', () => {
    const playerIds = Array.from({ length: 12 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29', seededRandom(7), 2)
    const next = buildNextRound(state, seededRandom(8))
    expect(next.courtCount).toBe(2)
    expect(next.rounds[1].courts).toHaveLength(2)
  })
})

describe('mid-tournament roster changes', () => {
  const scoreAll = (state: TournamentState): TournamentState => ({
    ...state,
    rounds: state.rounds.map((round) => ({
      ...round,
      courts: round.courts.map((court) => ({
        ...court,
        games: court.games.map((game, index) => ({
          ...game,
          scoreA: index % 2 === 0 ? '11' : '7',
          scoreB: index % 2 === 0 ? '7' : '11',
        })),
      })),
    })),
  })

  it('adds a player to the next unplayed round and regenerates it', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29', seededRandom(3))
    const { state: next, joinsRound } = addTournamentPlayer(state, 'p8', 0, seededRandom(4))

    expect(next.playerIds).toContain('p8')
    expect(joinsRound).toBe(1)
    // The unplayed opening round is rebuilt with the newcomer seated.
    const seated = new Set(next.rounds[0].courts.flatMap((court) => court.playerIds))
    expect(seated.has('p8')).toBe(true)
  })

  it('adds a player after a completed round without touching its scores', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `p${index}`)
    const played = scoreAll(createTournament(playerIds, '2026-07-29', seededRandom(3)))
    const withNext = buildNextRound(played, seededRandom(5))
    const before = JSON.stringify(withNext.rounds[0])

    const { state: next, joinsRound } = addTournamentPlayer(withNext, 'p8', 1, seededRandom(6))
    expect(joinsRound).toBe(2)
    // Round 1 scores are untouched; the unplayed round 2 now seats the newcomer.
    expect(JSON.stringify(next.rounds[0])).toBe(before)
    const seated = new Set(next.rounds[1].courts.flatMap((court) => court.playerIds))
    expect(seated.has('p8')).toBe(true)
  })

  it('removes a player but keeps scored games and completed rounds intact', () => {
    const playerIds = Array.from({ length: 9 }, (_, index) => `p${index}`)
    const played = scoreAll(createTournament(playerIds, '2026-07-29', seededRandom(3)))
    const withNext = buildNextRound(played, seededRandom(5))
    const round1Before = JSON.stringify(withNext.rounds[0])

    const { state: next, clearedSeats } = removeTournamentPlayer(withNext, 'p0', 1, seededRandom(6))
    expect(next.playerIds).not.toContain('p0')
    // Completed round 1 is history, scores and all.
    expect(JSON.stringify(next.rounds[0])).toBe(round1Before)
    // The unplayed round 2 is rebuilt with no trace of the removed player.
    const seats = next.rounds[1].courts.flatMap((court) =>
      court.games.flatMap((game) => [...game.teamA, ...game.teamB]),
    )
    expect(seats).not.toContain('p0')
    expect(seats).not.toContain('')
    expect(clearedSeats).toBe(0)
  })

  it('empties only the unplayed seats of a removed player mid-round', () => {
    const playerIds = Array.from({ length: 9 }, (_, index) => `p${index}`)
    const state = createTournament(playerIds, '2026-07-29', seededRandom(3))
    // Score just the first game everywhere so the round is partial.
    const partial: TournamentState = {
      ...state,
      rounds: state.rounds.map((round) => ({
        ...round,
        courts: round.courts.map((court) => ({
          ...court,
          games: court.games.map((courtGame, index) =>
            index === 0 ? { ...courtGame, scoreA: '11', scoreB: '7' } : courtGame,
          ),
        })),
      })),
    }
    const scoredBefore = partial.rounds[0].courts.map((court) => ({
      ...court.games[0],
    }))

    const { state: next, clearedSeats } = removeTournamentPlayer(partial, 'p0', 0, seededRandom(6))
    expect(clearedSeats).toBeGreaterThan(0)
    // Scored games are untouched.
    next.rounds[0].courts.forEach((court, index) => {
      expect({ ...court.games[0] }).toEqual(scoredBefore[index])
    })
    // Unplayed games no longer seat the removed player.
    next.rounds[0].courts.forEach((court) => {
      court.games.slice(1).forEach((game) => {
        expect([...game.teamA, ...game.teamB]).not.toContain('p0')
      })
    })
  })
})

describe('mid-tournament court changes', () => {
  it('keeps scored rounds and rebuilds the next round on the new court count', () => {
    const playerIds = Array.from({ length: 12 }, (_, index) => `p${index}`)
    const played = createTournament(playerIds, '2026-07-29', seededRandom(3), 3)
    const scored: TournamentState = {
      ...played,
      rounds: played.rounds.map((round) => ({
        ...round,
        courts: round.courts.map((court) => ({
          ...court,
          games: court.games.map((game) => ({ ...game, scoreA: '11', scoreB: '7' })),
        })),
      })),
    }

    const { state: next, droppedRounds, rebuilt } = setTournamentCourts(scored, 2)
    expect(droppedRounds).toBe(0)
    expect(rebuilt).toBe(false)
    expect(next.courtCount).toBe(2)
    // No unscored rounds existed, so nothing is rebuilt yet.
    expect(next.rounds).toHaveLength(1)
  })

  it('drops unscored rounds and rebuilds one round on fewer courts', () => {
    const playerIds = Array.from({ length: 12 }, (_, index) => `p${index}`)
    const state = buildNextRound(
      createTournament(playerIds, '2026-07-29', seededRandom(3), 3),
      seededRandom(4),
    )
    expect(state.rounds).toHaveLength(2)

    const { state: next, droppedRounds, rebuilt } = setTournamentCourts(state, 2, seededRandom(5))
    expect(droppedRounds).toBe(2)
    expect(rebuilt).toBe(true)
    expect(next.courtCount).toBe(2)
    expect(next.rounds).toHaveLength(1)
    expect(next.rounds[0].courts).toHaveLength(2)
    // 12 players on 2 courts: 4 sitters per game.
    expect(next.rounds[0].courts[0].games[0].sitOutIds).toHaveLength(4)
  })
})

describe('tournament state backfill', () => {
  it('fills in a missing court count for drafts saved before it existed', () => {
    const legacy = {
      playedOn: '2026-07-29',
      playerIds: Array.from({ length: 10 }, (_, index) => `p${index}`),
      satOutCounts: {},
      rounds: [],
      // No courtCount: drafts saved before it existed don't have the field.
    } as unknown as TournamentState
    expect(normalizeTournamentState(legacy).courtCount).toBe(2)
  })
})
