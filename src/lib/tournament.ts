export type TournamentGame = {
  id: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: string
  scoreB: string
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

// Every player partners each of the other three once: 12 v 34, 13 v 24, 14 v 23.
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

function buildCourt(round: number, court: number, playerIds: string[]): TournamentCourt {
  return {
    court,
    playerIds,
    games: PARTNER_ROTATIONS.map(([teamA, teamB], index) => ({
      id: `r${round}-c${court}-g${index + 1}`,
      teamA: [playerIds[teamA[0]], playerIds[teamA[1]]],
      teamB: [playerIds[teamB[0]], playerIds[teamB[1]]],
      scoreA: '',
      scoreB: '',
    })),
  }
}

export function createTournament(seededPlayerIds: string[], playedOn: string): TournamentState {
  const courtCount = Math.floor(seededPlayerIds.length / 4)
  const playing = seededPlayerIds.slice(0, courtCount * 4)
  const sitOutIds = seededPlayerIds.slice(courtCount * 4)
  const courts: TournamentCourt[] = []
  for (let index = 0; index < courtCount; index += 1) {
    courts.push(buildCourt(1, index + 1, playing.slice(index * 4, index * 4 + 4)))
  }
  return {
    playedOn,
    playerIds: seededPlayerIds,
    satOutCounts: Object.fromEntries(sitOutIds.map((id) => [id, 1])),
    rounds: [{ round: 1, courts, sitOutIds }],
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

// Rank a court's four players by wins, then point difference, then points for,
// then original court seeding.
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

// Build the next round: top 2 of each lower court move up, bottom 2 of each
// upper court move down. Sit-outs rotate in on the bottom court, replacing its
// weakest performers (players who have sat out the most get priority to play).
export function buildNextRound(state: TournamentState): TournamentState {
  const previous = state.rounds[state.rounds.length - 1]
  const ranked = previous.courts.map((court) =>
    rankCourtPlayers(court).map((result) => result.playerId),
  )
  const courtCount = ranked.length
  const newCourts: string[][] = []
  let newSitOuts: string[] = []

  for (let index = 0; index < courtCount; index += 1) {
    const stayOrDown = index === 0 ? ranked[0].slice(0, 2) : ranked[index - 1].slice(2)

    if (index < courtCount - 1) {
      newCourts.push([...stayOrDown, ...ranked[index + 1].slice(0, 2)])
      continue
    }

    // Bottom court: fill remaining slots from its non-promoted players plus
    // anyone who sat out, prioritising those who have sat out the most.
    const ownRemainder = courtCount === 1 ? ranked[index].slice(2) : ranked[index].slice(2)
    const pool = [...previous.sitOutIds, ...ownRemainder]
    const byMostSatOut = [...pool].sort(
      (a, b) => (state.satOutCounts[b] ?? 0) - (state.satOutCounts[a] ?? 0),
    )
    const slots = 4 - stayOrDown.length
    newCourts.push([...stayOrDown, ...byMostSatOut.slice(0, slots)])
    newSitOuts = byMostSatOut.slice(slots)
  }

  const satOutCounts = { ...state.satOutCounts }
  newSitOuts.forEach((playerId) => {
    satOutCounts[playerId] = (satOutCounts[playerId] ?? 0) + 1
  })

  const roundNumber = previous.round + 1
  return {
    ...state,
    satOutCounts,
    rounds: [
      ...state.rounds,
      {
        round: roundNumber,
        courts: newCourts.map((playerIds, index) => buildCourt(roundNumber, index + 1, playerIds)),
        sitOutIds: newSitOuts,
      },
    ],
  }
}
