export type TournamentGame = {
  id: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: string
  scoreB: string
  sitOutIds?: string[]
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
  const courtCount = Math.floor(seededPlayerIds.length / 4)
  const sitOutCount = seededPlayerIds.length % 4
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
      const courtPlayers = activePlayerIds.slice(courtIndex * 4, courtIndex * 4 + 4)
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
      const courtPlayers = seededPlayerIds.slice(courtIndex * 4, courtIndex * 4 + 4)
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

function rankRoundPlayers(round: TournamentRound, seedOrderIds: string[]) {
  const seedOrder = new Map(seedOrderIds.map((playerId, index) => [playerId, index]))
  const results = new Map<string, CourtPlayerResult>(
    seedOrderIds.map((playerId) => [
      playerId,
      { playerId, wins: 0, pointDiff: 0, pointsFor: 0 },
    ]),
  )

  round.courts.forEach((court) => {
    court.games.forEach((game) => {
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
  })

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
  return round.courts.every((court) => court.games.every((game) => parseGameScores(game)))
}

// Rank court players by wins, then point difference, then points for, then
// original court seeding. Overflow players who sit a game keep their court seed.
export function rankCourtPlayers(court: TournamentCourt): CourtPlayerResult[] {
  const results = new Map<string, CourtPlayerResult>(
    court.playerIds.map((playerId) => [
      playerId,
      { playerId, wins: 0, pointDiff: 0, pointsFor: 0 },
    ]),
  )

  court.games.forEach((game) => {
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

  const seedOrder = new Map(court.playerIds.map((playerId, index) => [playerId, index]))
  return [...results.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointDiff - a.pointDiff ||
      b.pointsFor - a.pointsFor ||
      (seedOrder.get(a.playerId) ?? 0) - (seedOrder.get(b.playerId) ?? 0),
  )
}

// Build the next round from the previous round's full results. Players are
// reseeded globally, then each game selects sit-outs from the whole field.
export function buildNextRound(
  state: TournamentState,
  random: () => number = Math.random,
): TournamentState {
  const previous = state.rounds[state.rounds.length - 1]
  const roundNumber = previous.round + 1
  const seededPlayerIds = rankRoundPlayers(previous, state.playerIds).map((result) => result.playerId)
  const round = buildRound(
    roundNumber,
    seededPlayerIds,
    state.satOutCounts,
    random,
    tournamentPartnerHistory(state.rounds),
  )
  return {
    ...state,
    playerIds: seededPlayerIds,
    satOutCounts: countGameSitOuts(round, state.satOutCounts),
    rounds: [
      ...state.rounds,
      round,
    ],
  }
}
