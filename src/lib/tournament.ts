import type { Match } from './types'

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
  // Players resting for the whole round (the field size isn't a multiple of
  // four). They sit every game of the round so each court stays a fixed four.
  sitOutIds: string[]
  // The full ladder order (all players, strongest first) used to seed this
  // round. Kept so the next round can hold a sit-out player at their ladder
  // position instead of treating a rest as a promotion or relegation. Optional
  // for backward compatibility with rounds rebuilt from saved match rows.
  order?: string[]
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

function buildRound(
  round: number,
  seededPlayerIds: string[],
  satOutCounts: Record<string, number>,
  random: () => number,
  existingPartnerHistory: Set<string> = new Set(),
): TournamentRound {
  // Rest one set of players for the whole round so every court is a fixed four
  // and the king-of-the-court ladder between rounds stays well-defined. (Rotating
  // a different sit-out each game would shuffle players between courts mid-round
  // and break the per-court promotion/relegation.)
  const sitOutCount = seededPlayerIds.length % PLAYERS_PER_COURT
  const sitOutIds = chooseGameSitOuts(
    seededPlayerIds,
    sitOutCount,
    satOutCounts,
    new Set<string>(),
    random,
  )

  const activePlayerIds = seededPlayerIds.filter((playerId) => !sitOutIds.includes(playerId))
  const courtCount = Math.floor(activePlayerIds.length / PLAYERS_PER_COURT)
  const courts = createEmptyCourts(courtCount)
  const roundPartnerHistory = new Set<string>()

  for (let courtIndex = 0; courtIndex < courtCount; courtIndex += 1) {
    const courtPlayers = activePlayerIds.slice(
      courtIndex * PLAYERS_PER_COURT,
      courtIndex * PLAYERS_PER_COURT + PLAYERS_PER_COURT,
    )
    courts[courtIndex].playerIds = courtPlayers
    for (let gameIndex = 0; gameIndex < GAMES_PER_ROUND; gameIndex += 1) {
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

  return {
    round,
    courts,
    sitOutIds,
    order: [...seededPlayerIds],
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

// Tally one rest per player for the round so the rotation keeps sit-outs even
// across rounds. Players now sit a whole round at a time rather than per game.
function countRoundSitOuts(round: TournamentRound, current: Record<string, number>) {
  const counts = { ...current }
  round.sitOutIds.forEach((playerId) => {
    counts[playerId] = (counts[playerId] ?? 0) + 1
  })
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
    satOutCounts: countRoundSitOuts(round, satOutCounts),
    rounds: [round],
  }
}

// Rebuild an editable bracket from finished match rows so a tournament saved to
// the leaderboard can be reopened on the tournament screen. Matches store the
// winner as teamA; we keep the recorded scores but flag which side won so the
// screen shows what was played. Games are grouped by round then court, in the
// order the rows appear. Sit-out and skipped-game detail isn't recoverable from
// match rows, so it's omitted — only games that were actually played come back.
export function reconstructTournament(matches: Match[], playedOn: string): TournamentState {
  const tagged = matches.filter(
    (match) => typeof match.round === 'number' && typeof match.court === 'number',
  )
  const roundNumbers = [...new Set(tagged.map((match) => match.round as number))].sort(
    (a, b) => a - b,
  )

  const rounds: TournamentRound[] = roundNumbers.map((roundNumber) => {
    const roundMatches = tagged.filter((match) => match.round === roundNumber)
    const courtNumbers = [...new Set(roundMatches.map((match) => match.court as number))].sort(
      (a, b) => a - b,
    )
    const courts: TournamentCourt[] = courtNumbers.map((courtNumber) => {
      const courtMatches = roundMatches.filter((match) => match.court === courtNumber)
      const playerIds: string[] = []
      const seen = new Set<string>()
      const addPlayer = (id: string) => {
        if (id && !seen.has(id)) {
          seen.add(id)
          playerIds.push(id)
        }
      }
      const games: TournamentGame[] = courtMatches.map((match, index) => {
        match.teamA.forEach(addPlayer)
        match.teamB.forEach(addPlayer)
        return {
          id: `r${roundNumber}-c${courtNumber}-g${index + 1}`,
          teamA: [match.teamA[0], match.teamA[1]],
          teamB: [match.teamB[0], match.teamB[1]],
          scoreA: String(match.scoreA),
          scoreB: String(match.scoreB),
        }
      })
      return { court: courtNumber, playerIds, games }
    })
    return { round: roundNumber, courts, sitOutIds: [] }
  })

  // Seed order isn't stored, so approximate it from the order players first
  // appear (round 1, court 1 first). It's only used as a ranking tiebreaker.
  const playerIds: string[] = []
  const seenPlayers = new Set<string>()
  rounds.forEach((round) =>
    round.courts.forEach((court) =>
      court.playerIds.forEach((id) => {
        if (!seenPlayers.has(id)) {
          seenPlayers.add(id)
          playerIds.push(id)
        }
      }),
    ),
  )

  return { playedOn, playerIds, satOutCounts: {}, rounds }
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

// True when a game has four distinct players — no empty seat (the empty string
// is the "missing player" sentinel) and no player appearing twice. The database
// rejects any match whose four players aren't all different.
export function gameHasAllPlayers(game: TournamentGame): boolean {
  const seats = [...game.teamA, ...game.teamB]
  if (seats.some((id) => !id)) return false
  return new Set(seats).size === seats.length
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

// The next round's full ladder order from the previous round's results. Every
// court holds a fixed four, so the king-of-the-court ladder (top two up, bottom
// two down) applies whatever the field size: players who sat out hold their
// ladder position, and the active courts promote/relegate around them. This is
// what stops a player who swept a weak bottom court from leapfrogging onto the
// top court past players who lost tougher games higher up. When the previous
// round's courts aren't clean fours (e.g. a tournament rebuilt from saved match
// rows), fall back to a global reseed so the order stays well-defined.
function nextRoundOrder(previous: TournamentRound, seedOrderIds: string[]): string[] {
  const courtsAreCleanFours =
    previous.courts.length > 0 &&
    previous.courts.every((court) => court.playerIds.length === PLAYERS_PER_COURT)

  if (!courtsAreCleanFours) {
    return rankRoundPlayers(previous, seedOrderIds).map((result) => result.playerId)
  }

  const promoted = promoteRelegate(previous, seedOrderIds)
  const sitOutIds = previous.sitOutIds ?? []
  if (sitOutIds.length === 0) return promoted

  // Slot the promoted/relegated active players back into the non-resting
  // positions of the order that built this round, leaving each sit-out player
  // exactly where they were so resting is neither a promotion nor relegation.
  const sitOutSet = new Set(sitOutIds)
  const prevOrder =
    previous.order ?? [...previous.courts.flatMap((court) => court.playerIds), ...sitOutIds]
  const promotedQueue = [...promoted]
  return prevOrder.map((playerId) =>
    sitOutSet.has(playerId) ? playerId : (promotedQueue.shift() ?? playerId),
  )
}

// Build the next round from the previous round's results using the court ladder.
// The original seed order in state.playerIds is kept stable so it remains a
// consistent tiebreaker.
export function buildNextRound(
  state: TournamentState,
  random: () => number = Math.random,
): TournamentState {
  const previous = state.rounds[state.rounds.length - 1]
  const roundNumber = previous.round + 1

  const orderedPlayerIds = nextRoundOrder(previous, state.playerIds)

  const round = buildRound(
    roundNumber,
    orderedPlayerIds,
    state.satOutCounts,
    random,
    tournamentPartnerHistory(state.rounds),
  )
  return {
    ...state,
    satOutCounts: countRoundSitOuts(round, state.satOutCounts),
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
    (counts, round) => countRoundSitOuts(round, counts),
    {},
  )
  let rebuilt: TournamentState = { ...state, rounds: keptRounds, satOutCounts }
  for (let i = roundIndex + 1; i < state.rounds.length; i += 1) {
    rebuilt = buildNextRound(rebuilt, random)
  }
  return rebuilt
}
