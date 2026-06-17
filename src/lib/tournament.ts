export type TournamentGame = {
  id: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: string
  scoreB: string
  sitOutIds?: string[]
  // Greyed out (e.g. not enough time to play). Skipped games are excluded from
  // completion checks, rankings, and the leaderboard, and can be un-skipped.
  skipped?: boolean
}

export type TournamentCourt = {
  court: number
  playerIds: string[]
  games: TournamentGame[]
}

export type TournamentRound = {
  round: number
  courts: TournamentCourt[]
  sitOutIds: string[]
}

export type TournamentState = {
  playedOn: string
  playerIds: string[]
  satOutCounts: Record<string, number>
  rounds: TournamentRound[]
}

export type CourtPlayerResult = {
  playerId: string
  wins: number
  pointDiff: number
  pointsFor: number
}

const PARTNER_ROTATIONS: [[number, number], [number, number]][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
]

const GAMES_PER_ROUND = 3
const PLAYERS_PER_COURT = 4
// Top two of each court move up a court and bottom two move down (king of the court).
const MOVERS_PER_COURT = 2

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function chooseGameSitOuts(
  playerIds: string[],
  count: number,
  satOutCounts: Record<string, number>,
  usedInRound: Set<string>,
  random: () => number,
) {
  if (count === 0) return []

  const unusedNeverSat = playerIds.filter(
    (playerId) => !usedInRound.has(playerId) && (satOutCounts[playerId] ?? 0) === 0,
  )

  if (unusedNeverSat.length >= count) {
    return shuffled(unusedNeverSat, random).slice(0, count)
  }

  const candidates = playerIds
    .filter((playerId) => !usedInRound.has(playerId))
    .sort((a, b) => (satOutCounts[a] ?? 0) - (satOutCounts[b] ?? 0))

  if (candidates.length >= count) {
    const lowestCount = satOutCounts[candidates[0]] ?? 0
    const lowestCandidates = candidates.filter((playerId) => (satOutCounts[playerId] ?? 0) === lowestCount)
    return shuffled(lowestCandidates, random).slice(0, count)
  }

  const fallbackLowestCount = Math.min(...playerIds.map((playerId) => satOutCounts[playerId] ?? 0))
  return shuffled(
    playerIds.filter((playerId) => (satOutCounts[playerId] ?? 0) === fallbackLowestCount),
    random,
  ).slice(0, count)
}

function partnerKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

function choosePartnerRotation(
  rankedPlayerIds: string[],
  roundPartnerHistory: Set<string>,
  existingPartnerHistory: Set<string>,
  random: () => number,
): [[number, number], [number, number]] {
  const scoredRotations = PARTNER_ROTATIONS.map((rotation) => {
    const roundRepeatCount = rotation.reduce(
      (total, team) =>
        total +
        (roundPartnerHistory.has(partnerKey(rankedPlayerIds[team[0]], rankedPlayerIds[team[1]]))
          ? 1
          : 0),
      0,
    )
    const historicalRepeatCount = rotation.reduce(
      (total, team) =>
        total +
        (existingPartnerHistory.has(partnerKey(rankedPlayerIds[team[0]], rankedPlayerIds[team[1]]))
          ? 1
          : 0),
      0,
    )
    const teamARankTotal = rotation[0][0] + rotation[0][1]
    const teamBRankTotal = rotation[1][0] + rotation[1][1]
    return {
      rotation,
      roundRepeatCount,
      historicalRepeatCount,
      balanceGap: Math.abs(teamARankTotal - teamBRankTotal),
      tieBreaker: random(),
    }
  })

  return scoredRotations.sort(
    (a, b) =>
      a.roundRepeatCount - b.roundRepeatCount ||
      a.historicalRepeatCount - b.historicalRepeatCount ||
      a.balanceGap - b.balanceGap ||
      a.tieBreaker - b.tieBreaker,
  )[0].rotation
}

function buildGame(
  round: number,
  court: number,
  gameNumber: number,
  rankedPlayerIds: string[],
  sitOutIds: string[],
  roundPartnerHistory: Set<string>,
  existingPartnerHistory: Set<string>,
  random: () => number,
): TournamentGame {
  const [teamAIndexes, teamBIndexes] = choosePartnerRotation(
    rankedPlayerIds,
    roundPartnerHistory,
    existingPartnerHistory,
    random,
  )
  const teamA: [string, string] = [rankedPlayerIds[teamAIndexes[0]], rankedPlayerIds[teamAIndexes[1]]]
  const teamB: [string, string] = [rankedPlayerIds[teamBIndexes[0]], rankedPlayerIds[teamBIndexes[1]]]

  roundPartnerHistory.add(partnerKey(teamA[0], teamA[1]))
  roundPartnerHistory.add(partnerKey(teamB[0], teamB[1]))

  return {
    id: `r${round}-c${court}-g${gameNumber}`,
    teamA,
    teamB,
    scoreA: '',
    scoreB: '',
    sitOutIds,
  }
}

function createEmptyCourts(courtCount: number): TournamentCourt[] {
  return Array.from({ length: courtCount }, (_, index) => ({
    court: index + 1,
    playerIds: [],
    games: [],
  }))
}

function addCourtPlayers(court: TournamentCourt, playerIds: string[]) {
  const existing = new Set(court.playerIds)
  playerIds.forEach((playerId) => {
    if (!existing.has(playerId)) {
      court.playerIds.push(playerId)
      existing.add(playerId)
    }
  })
}

function buildRound(
  round: number,
  seededPlayerIds: string[],
  satOutCounts: Record<string, number>,
  random: () => number,
  existingPartnerHistory: Set<string> = new Set(),
): TournamentRound {
  const courtCount = Math.floor(seededPlayerIds.length / PLAYERS_PER_COURT)
  const sitOutCount = seededPlayerIds.length % PLAYERS_PER_COURT
  const courts = createEmptyCourts(courtCount)
  const usedSitOuts = new Set<string>()
  const roundPartnerHistory = new Set<string>()

  for (let gameIndex = 0; gameIndex < GAMES_PER_ROUND; gameIndex += 1) {
    const sitOutIds = chooseGameSitOuts(
      seededPlayerIds,
      sitOutCount,
      satOutCounts,
      usedSitOuts,
      random,
    )
    sitOutIds.forEach((playerId) => usedSitOuts.add(playerId))

    const activePlayerIds = seededPlayerIds.filter((playerId) => !sitOutIds.includes(playerId))
    for (let courtIndex = 0; courtIndex < courtCount; courtIndex += 1) {
      const courtPlayers = activePlayerIds.slice(
        courtIndex * PLAYERS_PER_COURT,
        courtIndex * PLAYERS_PER_COURT + PLAYERS_PER_COURT,
      )
      addCourtPlayers(courts[courtIndex], courtPlayers)
      courts[courtIndex].games.push(
        buildGame(
          round,
          courtIndex + 1,
          gameIndex + 1,
          courtPlayers,
          sitOutIds,
          roundPartnerHistory,
          existingPartnerHistory,
          random,
        ),
      )
    }
  }

  if (sitOutCount === 0) {
    courts.forEach((court, courtIndex) => {
      const courtPlayers = seededPlayerIds.slice(
        courtIndex * PLAYERS_PER_COURT,
        courtIndex * PLAYERS_PER_COURT + PLAYERS_PER_COURT,
      )
      court.playerIds = courtPlayers
    })
  }

  return {
    round,
    courts,
    sitOutIds: [],
  }
}

function tournamentPartnerHistory(rounds: TournamentRound[]) {
  const pairs = new Set<string>()
  rounds.forEach((round) => {
    round.courts.forEach((court) => {
      court.games.forEach((game) => {
        pairs.add(partnerKey(game.teamA[0], game.teamA[1]))
        pairs.add(partnerKey(game.teamB[0], game.teamB[1]))
      })
    })
  })
  return pairs
}

function countGameSitOuts(round: TournamentRound, current: Record<string, number>) {
  const counts = { ...current }
  const gameCount = Math.max(...round.courts.map((court) => court.games.length))
  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const gameSitOutIds = new Set<string>()
    round.courts.forEach((court) => {
      court.games[gameIndex]?.sitOutIds?.forEach((playerId) => gameSitOutIds.add(playerId))
    })
    gameSitOutIds.forEach((playerId) => {
      counts[playerId] = (counts[playerId] ?? 0) + 1
    })
  }
  return counts
}

// Tally wins, point difference, and points for from a list of games into the
// provided results map (players not in the map are ignored).
function tallyGames(games: TournamentGame[], results: Map<string, CourtPlayerResult>) {
  games.forEach((game) => {
    if (game.skipped) return
    const scores = parseGameScores(game)
    if (!scores) return
    const apply = (playerId: string, scored: number, conceded: number) => {
      const result = results.get(playerId)
      if (!result) return
      result.wins += scored > conceded ? 1 : 0
      result.pointDiff += scored - conceded
      result.pointsFor += scored
    }
    game.teamA.forEach((playerId) => apply(playerId, scores.scoreA, scores.scoreB))
    game.teamB.forEach((playerId) => apply(playerId, scores.scoreB, scores.scoreA))
  })
}

function rankRoundPlayers(round: TournamentRound, seedOrderIds: string[]) {
  const seedOrder = new Map(seedOrderIds.map((playerId, index) => [playerId, index]))
  const results = new Map<string, CourtPlayerResult>(
    seedOrderIds.map((playerId) => [
      playerId,
      { playerId, wins: 0, pointDiff: 0, pointsFor: 0 },
    ]),
  )

  round.courts.forEach((court) => tallyGames(court.games, results))

  return [...results.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointDiff - a.pointDiff ||
      b.pointsFor - a.pointsFor ||
      (seedOrder.get(a.playerId) ?? 0) - (seedOrder.get(b.playerId) ?? 0),
  )
}

export function createTournament(
  seededPlayerIds: string[],
  playedOn: string,
  random: () => number = Math.random,
): TournamentState {
  const satOutCounts: Record<string, number> = {}
  const round = buildRound(1, seededPlayerIds, satOutCounts, random)
  return {
    playedOn,
    playerIds: seededPlayerIds,
    satOutCounts: countGameSitOuts(round, satOutCounts),
    rounds: [round],
  }
}

export function parseGameScores(game: TournamentGame) {
  const scoreA = Number(game.scoreA)
  const scoreB = Number(game.scoreB)
  if (game.scoreA.trim() === '' || game.scoreB.trim() === '') return null
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return null
  if (scoreA < 0 || scoreB < 0 || scoreA === scoreB) return null
  return { scoreA, scoreB }
}

export function isRoundComplete(round: TournamentRound) {
  return round.courts.every((court) =>
    court.games.every((game) => game.skipped || parseGameScores(game)),
  )
}

// True when every seat in a game is filled — i.e. no player was removed and
// left an empty slot. The empty string is the "missing player" sentinel.
export function gameHasAllPlayers(game: TournamentGame): boolean {
  return [...game.teamA, ...game.teamB].every((id) => Boolean(id))
}

// Rank a court's players by wins, then point difference, then seed in the
// rankings. Pass seedOrderIds (the tournament's original seed order) to break
// ties by global seed; otherwise the court's own seed order is used.
export function rankCourtPlayers(
  court: TournamentCourt,
  seedOrderIds?: string[],
): CourtPlayerResult[] {
  const results = new Map<string, CourtPlayerResult>(
    court.playerIds.map((playerId) => [
      playerId,
      { playerId, wins: 0, pointDiff: 0, pointsFor: 0 },
    ]),
  )

  tallyGames(court.games, results)

  const seedSource = seedOrderIds ?? court.playerIds
  const seedOrder = new Map(seedSource.map((playerId, index) => [playerId, index]))
  return [...results.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointDiff - a.pointDiff ||
      (seedOrder.get(a.playerId) ?? Infinity) - (seedOrder.get(b.playerId) ?? Infinity),
  )
}

export type CourtMovement = 'up' | 'down' | 'stays'

// Where a player finishing at rankIndex on a given court moves for the next
// round under the promotion/relegation ladder. Shared by the rotation logic and
// the results display so the two never drift apart.
export function courtMovement(
  rankIndex: number,
  court: number,
  courtCount: number,
): CourtMovement {
  if (rankIndex < MOVERS_PER_COURT) return court === 1 ? 'stays' : 'up'
  if (rankIndex >= PLAYERS_PER_COURT - MOVERS_PER_COURT) {
    return court === courtCount ? 'stays' : 'down'
  }
  return 'stays'
}

// Promote/relegate within the court ladder: on each court the top two players
// move up one court and the bottom two move down one, except court 1's top two
// and the lowest court's bottom two, which stay put. Players are ranked by wins,
// then point difference, then seed in the rankings. Returns the next round's
// players in court order (first four = court 1, next four = court 2, ...).
function promoteRelegate(previous: TournamentRound, seedOrderIds: string[]): string[] {
  const courts = [...previous.courts].sort((a, b) => a.court - b.court)
  const ranked = courts.map((court) =>
    rankCourtPlayers(court, seedOrderIds).map((result) => result.playerId),
  )
  const top = ranked.map((ids) => ids.slice(0, MOVERS_PER_COURT))
  const bottom = ranked.map((ids) => ids.slice(PLAYERS_PER_COURT - MOVERS_PER_COURT))

  const ordered: string[] = []
  for (let courtIndex = 0; courtIndex < courts.length; courtIndex += 1) {
    if (courtIndex === 0) {
      // Highest court: its top two stay, joined by the next court's top two.
      ordered.push(...top[0], ...(courts.length > 1 ? top[1] : bottom[0]))
    } else if (courtIndex === courts.length - 1) {
      // Lowest court: the court above's bottom two drop in, its bottom two stay.
      ordered.push(...bottom[courtIndex - 1], ...bottom[courtIndex])
    } else {
      // Middle court: relegated from above join the promoted from below.
      ordered.push(...bottom[courtIndex - 1], ...top[courtIndex + 1])
    }
  }
  return ordered
}

// Build the next round from the previous round's results using court-ladder
// promotion/relegation. When the field isn't a multiple of four (players rotate
// through sit-outs and courts don't hold a fixed four), fall back to a global
// reseed so the ladder stays well-defined. The original seed order in
// state.playerIds is kept stable so it remains a consistent tiebreaker.
export function buildNextRound(
  state: TournamentState,
  random: () => number = Math.random,
): TournamentState {
  const previous = state.rounds[state.rounds.length - 1]
  const roundNumber = previous.round + 1

  const cleanLadder =
    state.playerIds.length % PLAYERS_PER_COURT === 0 &&
    previous.courts.length === state.playerIds.length / PLAYERS_PER_COURT &&
    previous.courts.every((court) => court.playerIds.length === PLAYERS_PER_COURT)

  const orderedPlayerIds = cleanLadder
    ? promoteRelegate(previous, state.playerIds)
    : rankRoundPlayers(previous, state.playerIds).map((result) => result.playerId)

  const round = buildRound(
    roundNumber,
    orderedPlayerIds,
    state.satOutCounts,
    random,
    tournamentPartnerHistory(state.rounds),
  )
  return {
    ...state,
    satOutCounts: countGameSitOuts(round, state.satOutCounts),
    rounds: [
      ...state.rounds,
      round,
    ],
  }
}

// Keep rounds up to and including roundIndex and regenerate every later round
// from the (possibly edited) results via promotion/relegation. Regenerated
// rounds start with empty scores; sit-out counts are recomputed from the kept
// rounds so rotation fairness stays correct. Use this to propagate a score edit
// in an earlier round through to the rounds that followed it.
export function rebuildRoundsAfter(
  state: TournamentState,
  roundIndex: number,
  random: () => number = Math.random,
): TournamentState {
  const keptRounds = state.rounds.slice(0, roundIndex + 1)
  const satOutCounts = keptRounds.reduce<Record<string, number>>(
    (counts, round) => countGameSitOuts(round, counts),
    {},
  )
  let rebuilt: TournamentState = { ...state, rounds: keptRounds, satOutCounts }
  for (let i = roundIndex + 1; i < state.rounds.length; i += 1) {
    rebuilt = buildNextRound(rebuilt, random)
  }
  return rebuilt
}
