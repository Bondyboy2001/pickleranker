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

type TournamentCourt = {
  court: number
  // Everyone who played on this court during the round, in ladder order. Usually
  // four, but more when the sit-out rotation moved a player across a court
  // boundary for a game.
  playerIds: string[]
  games: TournamentGame[]
}

export type TournamentRound = {
  round: number
  courts: TournamentCourt[]
  // Legacy: players who rested every game of the round. Rounds now rotate the
  // rest game by game (see game.sitOutIds), so this is empty on new rounds and
  // only set on rounds generated before the rotation existed.
  sitOutIds: string[]
  // The full ladder order (all players, strongest first) used to seed this
  // round. Courts are re-formed from it every game as players rotate through
  // their rest, and the next round's ladder is slotted back into it. Optional
  // for backward compatibility with rounds rebuilt from saved match rows.
  order?: string[]
}

export type TournamentState = {
  playedOn: string
  playerIds: string[]
  satOutCounts: Record<string, number>
  rounds: TournamentRound[]
  // How many courts the venue has. Fewer courts than players allow means extra
  // players rotate through sit-outs each game. Backfilled on load for drafts
  // saved before this existed (see normalizeTournamentState).
  courtCount: number
}

type CourtPlayerResult = {
  playerId: string
  wins: number
  pointDiff: number
  pointsFor: number
  // Scored games this player actually played in the round. Players sit out
  // different games, so ranking compares per-game averages rather than totals.
  gamesPlayed: number
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

// Courts in play when the organiser doesn't pick a number: as many full courts
// as the field allows, at least one.
export function defaultCourtCount(playerCount: number) {
  return Math.max(1, Math.floor(playerCount / PLAYERS_PER_COURT))
}

// Clamp an organiser-picked court count to what the roster can fill: at least
// one court, at most one full court per four players.
export function clampCourtCount(value: number, playerCount: number) {
  if (!Number.isFinite(value)) return defaultCourtCount(playerCount)
  return Math.min(Math.max(1, Math.floor(value)), defaultCourtCount(playerCount))
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

// Who rests this game: players who haven't sat yet this round come first, then
// whoever has rested least across the tournament. Shuffling before the (stable)
// sort makes the pick random within a tier, so equally-rested players take turns.
// Always returns `count` players while the field is big enough — a short list
// would leave a court without four.
function chooseGameSitOuts(
  playerIds: string[],
  count: number,
  satOutCounts: Record<string, number>,
  usedInRound: Set<string>,
  random: () => number,
) {
  if (count === 0) return []
  return shuffled(playerIds, random)
    .sort(
      (a, b) =>
        Number(usedInRound.has(a)) - Number(usedInRound.has(b)) ||
        (satOutCounts[a] ?? 0) - (satOutCounts[b] ?? 0),
    )
    .slice(0, count)
}

function partnerKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

// Collects player ids in first-seen order, skipping blanks (the "missing player"
// sentinel) and repeats.
function uniqueIds() {
  const seen = new Set<string>()
  const ids: string[] = []
  return {
    ids,
    add: (id: string) => {
      if (!id || seen.has(id)) return
      seen.add(id)
      ids.push(id)
    },
  }
}

function choosePartnerRotation(
  rankedPlayerIds: string[],
  roundPartnerHistory: Set<string>,
  existingPartnerHistory: Set<string>,
  random: () => number,
): [[number, number], [number, number]] {
  // How many of a rotation's two pairings have partnered before.
  const countRepeats = (
    rotation: [[number, number], [number, number]],
    history: Set<string>,
  ) =>
    rotation.filter((team) =>
      history.has(partnerKey(rankedPlayerIds[team[0]], rankedPlayerIds[team[1]])),
    ).length

  const scoredRotations = PARTNER_ROTATIONS.map((rotation) => {
    const roundRepeatCount = countRepeats(rotation, roundPartnerHistory)
    const historicalRepeatCount = countRepeats(rotation, existingPartnerHistory)
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
    // Copied, not shared: every court's game for this slot carries the same rest
    // set, and each one has to be editable on its own.
    sitOutIds: [...sitOutIds],
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
  courtCount: number = defaultCourtCount(seededPlayerIds.length),
): TournamentRound {
  // When the field isn't a multiple of the courts' seats, a different set of
  // players sits out each game rather than the same players resting the whole
  // round. The players left standing are re-seeded into courts by ladder order
  // every game, so each court is always a clean four and stays ordered by
  // strength — a player near a court boundary can shift one court for a game
  // when someone above them sits.
  const courtsInPlay = Math.max(
    1,
    Math.min(courtCount, defaultCourtCount(seededPlayerIds.length)),
  )
  const sitOutCount = Math.max(0, seededPlayerIds.length - courtsInPlay * PLAYERS_PER_COURT)
  const courts = createEmptyCourts(courtsInPlay)
  const roundPartnerHistory = new Set<string>()
  // Nobody sits twice in a round until everyone has sat once; running counts keep
  // the rotation fair across rounds too.
  const satOutSoFar = { ...satOutCounts }
  const usedInRound = new Set<string>()

  for (let gameIndex = 0; gameIndex < GAMES_PER_ROUND; gameIndex += 1) {
    const sitOutIds = chooseGameSitOuts(
      seededPlayerIds,
      sitOutCount,
      satOutSoFar,
      usedInRound,
      random,
    )
    sitOutIds.forEach((playerId) => {
      usedInRound.add(playerId)
      satOutSoFar[playerId] = (satOutSoFar[playerId] ?? 0) + 1
    })

    const activePlayerIds = seededPlayerIds.filter((playerId) => !sitOutIds.includes(playerId))
    for (let courtIndex = 0; courtIndex < courtsInPlay; courtIndex += 1) {
      // A shrunken roster can leave a court short: pad with the missing-player
      // sentinel ('') so the seat renders as fillable instead of crashing.
      const courtPlayers: string[] = activePlayerIds.slice(
        courtIndex * PLAYERS_PER_COURT,
        courtIndex * PLAYERS_PER_COURT + PLAYERS_PER_COURT,
      )
      while (courtPlayers.length < PLAYERS_PER_COURT) courtPlayers.push('')
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

  // A court's roster is everyone who played there at least once this round (five
  // or six players when the rotation shifts someone across a court boundary).
  courts.forEach((court) => {
    court.playerIds = seededPlayerIds.filter((playerId) =>
      court.games.some(
        (game) => game.teamA.includes(playerId) || game.teamB.includes(playerId),
      ),
    )
  })

  return {
    round,
    courts,
    sitOutIds: [],
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

// Recompute who is resting each game from the line-ups actually on court, so a
// manual substitution can't leave a player shown as both playing and sitting.
// Games that never tracked rests (rounds rebuilt from saved match rows) are left
// alone — there's no record of who was there but not playing.
export function syncGameSitOuts(round: TournamentRound): TournamentRound {
  const roster = roundRoster(round)
  const seatedByGame = gameSeats(round)
  return {
    ...round,
    courts: round.courts.map((court) => ({
      ...court,
      games: court.games.map((game, gameIndex) =>
        game.sitOutIds === undefined
          ? game
          : {
              ...game,
              sitOutIds: roster.filter((playerId) => !seatedByGame[gameIndex].has(playerId)),
            },
      ),
    })),
  }
}

// Everyone in the round, in ladder order. `order` is authoritative when present;
// rounds rebuilt from saved match rows don't have it, so fall back to the players
// seen across the courts plus any whole-round sitters.
function roundRoster(round: TournamentRound): string[] {
  return (
    round.order ??
    [...new Set([...round.courts.flatMap((court) => court.playerIds), ...(round.sitOutIds ?? [])])]
  )
}

// Courts can hold different numbers of games only while a round is being built,
// so the longest court defines how many games the round has.
function roundGameCount(round: TournamentRound) {
  return round.courts.reduce((most, court) => Math.max(most, court.games.length), 0)
}

// Everyone on court for each game of the round, indexed by game number.
function gameSeats(round: TournamentRound): Set<string>[] {
  return Array.from({ length: roundGameCount(round) }, (_, gameIndex) => {
    const seated = new Set<string>()
    round.courts.forEach((court) => {
      const game = court.games[gameIndex]
      if (!game) return
      ;[...game.teamA, ...game.teamB].forEach((playerId) => {
        if (playerId) seated.add(playerId)
      })
    })
    return seated
  })
}

// The players sitting out each game, indexed by game number. Every court's game
// carries the same list, so the union across courts is the game's rest set.
function gameSitOutIds(round: TournamentRound): string[][] {
  return Array.from({ length: roundGameCount(round) }, (_, gameIndex) => {
    const ids = new Set<string>()
    round.courts.forEach((court) =>
      court.games[gameIndex]?.sitOutIds?.forEach((playerId) => ids.add(playerId)),
    )
    return [...ids]
  })
}

// Tally each player's rests for the round so the rotation keeps sit-outs even
// across rounds. Legacy rounds rested a player for the whole round (one rest);
// rounds now rest players game by game, so each game they sit counts.
function countRoundSitOuts(round: TournamentRound, current: Record<string, number>) {
  const counts = { ...current }
  const wholeRound = new Set(round.sitOutIds ?? [])
  wholeRound.forEach((playerId) => {
    counts[playerId] = (counts[playerId] ?? 0) + 1
  })
  gameSitOutIds(round).forEach((sitters) =>
    sitters.forEach((playerId) => {
      if (wholeRound.has(playerId)) return
      counts[playerId] = (counts[playerId] ?? 0) + 1
    }),
  )
  return counts
}

// Total rests across a set of rounds, from scratch. Legacy rounds rested a
// player for the whole round (one rest); rounds now rest players game by game,
// so each game they sit counts.
function countTournamentSitOuts(rounds: TournamentRound[]) {
  return rounds.reduce<Record<string, number>>(
    (counts, round) => countRoundSitOuts(round, counts),
    {},
  )
}

type RoundPlayerResult = CourtPlayerResult & {
  // How many games this player played on each court number this round.
  courtGames: Map<number, number>
}

// Wins, point difference, points for, and games played for everyone who appears
// in the round, plus which courts they appeared on. Unscored and skipped games
// still count as an appearance (so courts group correctly before scoring) but
// not as a game played.
function collectRoundResults(round: TournamentRound) {
  const results = new Map<string, RoundPlayerResult>()
  const ensure = (playerId: string) => {
    const existing = results.get(playerId)
    if (existing) return existing
    const created: RoundPlayerResult = {
      playerId,
      wins: 0,
      pointDiff: 0,
      pointsFor: 0,
      gamesPlayed: 0,
      courtGames: new Map(),
    }
    results.set(playerId, created)
    return created
  }

  round.courts.forEach((court) => {
    court.games.forEach((game) => {
      const seats = [...game.teamA, ...game.teamB].filter(Boolean)
      seats.forEach((playerId) => {
        const result = ensure(playerId)
        result.courtGames.set(court.court, (result.courtGames.get(court.court) ?? 0) + 1)
      })
      if (game.skipped) return
      const scores = parseGameScores(game)
      if (!scores) return
      const apply = (playerId: string, scored: number, conceded: number) => {
        if (!playerId) return
        const result = ensure(playerId)
        result.gamesPlayed += 1
        result.wins += scored > conceded ? 1 : 0
        result.pointDiff += scored - conceded
        result.pointsFor += scored
      }
      game.teamA.forEach((playerId) => apply(playerId, scores.scoreA, scores.scoreB))
      game.teamB.forEach((playerId) => apply(playerId, scores.scoreB, scores.scoreA))
    })
  })

  return results
}

// Compare on per-game averages, not totals: a player who sat out a game had one
// fewer chance to win, and resting should be neither a promotion nor a penalty.
function compareByAverage(a: CourtPlayerResult, b: CourtPlayerResult) {
  const per = (result: CourtPlayerResult, total: number) =>
    result.gamesPlayed > 0 ? total / result.gamesPlayed : 0
  return (
    per(b, b.wins) - per(a, a.wins) ||
    per(b, b.pointDiff) - per(a, a.pointDiff) ||
    per(b, b.pointsFor) - per(a, a.pointsFor)
  )
}

// The court a player belongs to for the round: where they played the most games,
// tie-broken towards the court their ladder position seeded them onto.
function primaryCourt(result: RoundPlayerResult, courtNumbers: number[], seedIndex: number) {
  const seedCourt = Math.min(
    courtNumbers.length,
    Math.floor(seedIndex / PLAYERS_PER_COURT) + 1,
  )
  let bestCourt: number | null = null
  let bestGames = 0
  for (const court of courtNumbers) {
    const games = result.courtGames.get(court) ?? 0
    if (games === 0) continue
    const better =
      bestCourt === null ||
      games > bestGames ||
      (games === bestGames && Math.abs(court - seedCourt) < Math.abs(bestCourt - seedCourt))
    if (better) {
      bestCourt = court
      bestGames = games
    }
  }
  return bestCourt
}

// The round's finishing order per court, best first. Players are grouped by the
// court they played most, and ranked on their whole round (games on another
// court still count). Used both for the on-screen court finish and for the
// promotion/relegation ladder, so the two can't drift apart.
export function roundCourtRankings(
  round: TournamentRound,
  seedOrderIds?: string[],
): CourtPlayerResult[][] {
  const courts = [...round.courts].sort((a, b) => a.court - b.court)
  const courtNumbers = courts.map((court) => court.court)
  const ladderOrder = round.order ?? courts.flatMap((court) => court.playerIds)
  const ladderIndex = new Map(ladderOrder.map((playerId, index) => [playerId, index]))
  const seedSource = seedOrderIds ?? ladderOrder
  const seedIndex = new Map(seedSource.map((playerId, index) => [playerId, index]))

  const groups: CourtPlayerResult[][] = courts.map(() => [])
  collectRoundResults(round).forEach((result) => {
    // A substitute who wasn't in the ladder order is treated as bottom-seeded.
    const ladderPosition = ladderIndex.get(result.playerId) ?? ladderOrder.length
    const court = primaryCourt(result, courtNumbers, ladderPosition)
    if (court === null) return
    const groupIndex = courtNumbers.indexOf(court)
    groups[groupIndex].push({
      playerId: result.playerId,
      wins: result.wins,
      pointDiff: result.pointDiff,
      pointsFor: result.pointsFor,
      gamesPlayed: result.gamesPlayed,
    })
  })

  groups.forEach((group) =>
    group.sort(
      (a, b) =>
        compareByAverage(a, b) ||
        (seedIndex.get(a.playerId) ?? Infinity) - (seedIndex.get(b.playerId) ?? Infinity),
    ),
  )
  return groups
}

// Whether a round has any played content worth keeping: a scored game or a
// deliberate skip. Rounds without either can be regenerated freely.
function roundHasProgress(round: TournamentRound) {
  return round.courts.some((court) =>
    court.games.some((game) => game.skipped || parseGameScores(game)),
  )
}

export function createTournament(
  seededPlayerIds: string[],
  playedOn: string,
  random: () => number = Math.random,
  courtCount: number = defaultCourtCount(seededPlayerIds.length),
): TournamentState {
  const courts = clampCourtCount(courtCount, seededPlayerIds.length)
  const satOutCounts: Record<string, number> = {}
  const round = buildRound(1, seededPlayerIds, satOutCounts, random, new Set(), courts)
  return {
    playedOn,
    playerIds: seededPlayerIds,
    satOutCounts: countRoundSitOuts(round, satOutCounts),
    rounds: [round],
    courtCount: courts,
  }
}

// Backfill fields added after a draft was saved, so old drafts and reopened
// brackets behave like new ones.
export function normalizeTournamentState(state: TournamentState): TournamentState {
  return {
    ...state,
    satOutCounts: state.satOutCounts ?? {},
    courtCount: clampCourtCount(
      state.courtCount ?? defaultCourtCount(state.playerIds.length),
      state.playerIds.length,
    ),
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
      const roster = uniqueIds()
      const games: TournamentGame[] = courtMatches.map((match, index) => {
        match.teamA.forEach(roster.add)
        match.teamB.forEach(roster.add)
        return {
          id: `r${roundNumber}-c${courtNumber}-g${index + 1}`,
          teamA: [match.teamA[0], match.teamA[1]],
          teamB: [match.teamB[0], match.teamB[1]],
          scoreA: String(match.scoreA),
          scoreB: String(match.scoreB),
        }
      })
      return { court: courtNumber, playerIds: roster.ids, games }
    })
    return { round: roundNumber, courts, sitOutIds: [] }
  })

  // Seed order isn't stored, so approximate it from the order players first
  // appear (round 1, court 1 first). It's only used as a ranking tiebreaker.
  const seedOrder = uniqueIds()
  rounds.forEach((round) =>
    round.courts.forEach((court) => court.playerIds.forEach(seedOrder.add)),
  )

  return {
    playedOn,
    playerIds: seedOrder.ids,
    satOutCounts: {},
    rounds,
    courtCount: rounds[0]?.courts.length ?? defaultCourtCount(seedOrder.ids.length),
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

// True when a game has four distinct players — no empty seat (the empty string
// is the "missing player" sentinel) and no player appearing twice. The database
// rejects any match whose four players aren't all different.
export function gameHasAllPlayers(game: TournamentGame): boolean {
  const seats = [...game.teamA, ...game.teamB]
  if (seats.some((id) => !id)) return false
  return new Set(seats).size === seats.length
}

export type CourtMovement = 'up' | 'down' | 'stays'

// How many players move each way off a court. Normally the top two up and the
// bottom two down; a court that ended up with fewer than four players in the
// rotation moves fewer so the two groups can't overlap.
function moversForCourt(courtSize: number) {
  return Math.min(MOVERS_PER_COURT, Math.floor(courtSize / 2))
}

// Where a player finishing at rankIndex on a given court moves for the next
// round under the promotion/relegation ladder. Shared by the rotation logic and
// the results display so the two never drift apart.
export function courtMovement(
  rankIndex: number,
  court: number,
  courtCount: number,
  courtSize: number = PLAYERS_PER_COURT,
): CourtMovement {
  const movers = moversForCourt(courtSize)
  if (rankIndex < movers) return court === 1 ? 'stays' : 'up'
  if (rankIndex >= courtSize - movers) {
    return court === courtCount ? 'stays' : 'down'
  }
  return 'stays'
}

// Promote/relegate within the court ladder: on each court the top two players
// move up one court and the bottom two move down one, except court 1's top two
// and the lowest court's bottom two, which stay put. Anyone in between holds
// their court. Takes each court's finishing order (best first) and returns the
// next round's players in ladder order.
function promoteRelegate(rankedCourts: string[][]): string[] {
  const movers = rankedCourts.map((ids) => moversForCourt(ids.length))
  const top = rankedCourts.map((ids, index) => ids.slice(0, movers[index]))
  const middle = rankedCourts.map((ids, index) => ids.slice(movers[index], ids.length - movers[index]))
  const bottom = rankedCourts.map((ids, index) => ids.slice(ids.length - movers[index]))

  const ordered: string[] = []
  for (let courtIndex = 0; courtIndex < rankedCourts.length; courtIndex += 1) {
    // Court 1's top two stay put; every other court receives the court above's
    // relegated pair. The lowest court's bottom two stay; every other court
    // receives the court below's promoted pair.
    const fromAbove = courtIndex === 0 ? top[0] : bottom[courtIndex - 1]
    const fromBelow =
      courtIndex === rankedCourts.length - 1 ? bottom[courtIndex] : top[courtIndex + 1]
    ordered.push(...fromAbove, ...middle[courtIndex], ...fromBelow)
  }
  return ordered
}

// The next round's full ladder order from the previous round's results. The
// king-of-the-court ladder (top two up, bottom two down) runs on each court's
// finishing order, which stops a player who swept a weak bottom court from
// leapfrogging onto the top court past players who lost tougher games higher up.
// Players who didn't appear in any game (rounds generated before sit-outs
// rotated per game, or a round nobody played) hold their ladder position, so
// resting is neither a promotion nor a relegation.
function nextRoundOrder(previous: TournamentRound, seedOrderIds: string[]): string[] {
  const promoted = promoteRelegate(
    roundCourtRankings(previous, seedOrderIds).map((ranking) =>
      ranking.map((result) => result.playerId),
    ),
  )
  const prevOrder = roundRoster(previous)

  // Each position in the previous order is either held by a player who never
  // took the court, or filled from the promoted/relegated queue in order.
  const played = new Set(promoted)
  const queue = [...promoted]
  const placed = new Set<string>()
  const ordered: string[] = []
  prevOrder.forEach((playerId) => {
    if (!played.has(playerId)) {
      if (placed.has(playerId)) return
      ordered.push(playerId)
      placed.add(playerId)
      return
    }
    const nextId = queue.shift()
    if (nextId === undefined) return
    ordered.push(nextId)
    placed.add(nextId)
  })
  // Anyone added to the round after it was seeded lands at the bottom.
  queue.forEach((playerId) => {
    if (placed.has(playerId)) return
    ordered.push(playerId)
    placed.add(playerId)
  })
  return ordered
}

// Build one round seeded from a previous round's results: promotion/relegation
// sets the ladder, newcomers (added mid-tournament) land at the bottom, and
// removed players are dropped. Shared by next-round, tail-regeneration, and
// court-change builds so they all seed identically.
function buildRoundAfter(
  previous: TournamentRound,
  roundNumber: number,
  playerIds: string[],
  satOutCounts: Record<string, number>,
  courtCount: number,
  partnerHistory: Set<string>,
  random: () => number,
): { round: TournamentRound; satOutCounts: Record<string, number> } {
  // Players removed from the tournament mid-round can still linger in the
  // previous round's order; players added mid-round won't be there at all.
  const rosterIds = new Set(playerIds)
  const laddered = nextRoundOrder(previous, playerIds).filter((playerId) =>
    rosterIds.has(playerId),
  )
  const ladderedIds = new Set(laddered)
  const missing = playerIds.filter((playerId) => !ladderedIds.has(playerId))
  const orderedPlayerIds = [...laddered, ...missing]

  const round = buildRound(
    roundNumber,
    orderedPlayerIds,
    satOutCounts,
    random,
    partnerHistory,
    courtCount,
  )
  return { round, satOutCounts: countRoundSitOuts(round, satOutCounts) }
}

// Regenerate every round after roundIndex (exclusive) that has no played
// content, threading sit-out counts and partner history through. Rounds with
// scores or skips are kept as-is (their sit-outs still count towards rotation
// fairness). Returns the new rounds plus how many were regenerated.
function regenerateTail(
  rounds: TournamentRound[],
  fromIndex: number,
  playerIds: string[],
  courtCount: number,
  random: () => number,
): { rounds: TournamentRound[]; regenerated: number; firstRegenerated: number | null; satOutCounts: Record<string, number> } {
  const next = [...rounds]
  let counts = countTournamentSitOuts(next.slice(0, fromIndex + 1))
  let regenerated = 0
  let firstRegenerated: number | null = null
  for (let index = fromIndex + 1; index < next.length; index += 1) {
    if (roundHasProgress(next[index])) {
      counts = countRoundSitOuts(next[index], counts)
      continue
    }
    const previous = next[index - 1]
    // Regenerating the opening round: nothing to seed from, so deal fresh.
    const built = previous
      ? buildRoundAfter(
          previous,
          next[index].round,
          playerIds,
          counts,
          courtCount,
          tournamentPartnerHistory(next.slice(0, index)),
          random,
        )
      : (() => {
          const round = buildRound(next[index].round, playerIds, counts, random, new Set(), courtCount)
          return { round, satOutCounts: countRoundSitOuts(round, counts) }
        })()
    next[index] = built.round
    counts = built.satOutCounts
    regenerated += 1
    if (firstRegenerated === null) firstRegenerated = index
  }
  return { rounds: next, regenerated, firstRegenerated, satOutCounts: counts }
}

// Build the next round from the previous round's results using the court ladder.
// The original seed order in state.playerIds is kept stable so it remains a
// consistent tiebreaker.
export function buildNextRound(
  state: TournamentState,
  random: () => number = Math.random,
): TournamentState {
  const courtCount = state.courtCount ?? defaultCourtCount(state.playerIds.length)
  const previous = state.rounds[state.rounds.length - 1]
  const built = buildRoundAfter(
    previous,
    previous.round + 1,
    state.playerIds,
    state.satOutCounts,
    courtCount,
    tournamentPartnerHistory(state.rounds),
    random,
  )
  return {
    ...state,
    courtCount,
    satOutCounts: built.satOutCounts,
    rounds: [
      ...state.rounds,
      built.round,
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
  const satOutCounts = countTournamentSitOuts(keptRounds)
  let rebuilt: TournamentState = { ...state, rounds: keptRounds, satOutCounts }
  for (let i = roundIndex + 1; i < state.rounds.length; i += 1) {
    rebuilt = buildNextRound(rebuilt, random)
  }
  return rebuilt
}

// Add a player mid-tournament. They join the roster immediately; rounds after
// the active one that have no played content are regenerated to include them.
// Returns the round number they first appear in (the next round when nothing
// was regenerated).
export function addTournamentPlayer(
  state: TournamentState,
  playerId: string,
  activeRoundIndex: number,
  random: () => number = Math.random,
): { state: TournamentState; regeneratedRounds: number; joinsRound: number | null } {
  if (!playerId || state.playerIds.includes(playerId)) {
    return { state, regeneratedRounds: 0, joinsRound: null }
  }
  const courtCount = state.courtCount ?? defaultCourtCount(state.playerIds.length)
  const playerIds = [...state.playerIds, playerId]
  // Rounds with no played content (including the active one, if unplayed) are
  // regenerated so the new player is seated; rounds with scores keep them and
  // the player joins the next regenerated round instead.
  const tail = regenerateTail(state.rounds, activeRoundIndex - 1, playerIds, courtCount, random)
  const joinsRound =
    tail.firstRegenerated !== null
      ? tail.rounds[tail.firstRegenerated].round
      : tail.rounds[tail.rounds.length - 1].round + 1
  return {
    state: { ...state, courtCount, playerIds, rounds: tail.rounds, satOutCounts: tail.satOutCounts },
    regeneratedRounds: tail.regenerated,
    joinsRound,
  }
}

// Remove a player mid-tournament. Completed rounds and scored games stay
// untouched as history; the player's seats in unplayed games (active round
// onwards) are emptied for the organiser to refill, and later rounds without
// played content are regenerated without them. Returns how many seats were
// emptied.
export function removeTournamentPlayer(
  state: TournamentState,
  playerId: string,
  activeRoundIndex: number,
  random: () => number = Math.random,
): { state: TournamentState; clearedSeats: number; regeneratedRounds: number } {
  if (!state.playerIds.includes(playerId)) {
    return { state, clearedSeats: 0, regeneratedRounds: 0 }
  }
  const courtCount = state.courtCount ?? defaultCourtCount(state.playerIds.length)
  const blankSlot = (id: string) => (id === playerId ? '' : id)
  let clearedSeats = 0

  const rounds = state.rounds.map((round, roundIndex) => {
    // Earlier rounds are history — never touch them.
    if (roundIndex < activeRoundIndex) return round
    // Fully played rounds stay intact even when active (a scored game is a fact).
    if (isRoundComplete(round)) return round
    // Rounds with no played content are regenerated below, not blanked.
    if (!roundHasProgress(round)) return round
    const courts = round.courts.map((court) => ({
      ...court,
      playerIds: court.playerIds.filter((id) => id !== playerId),
      games: court.games.map((game) => {
        // Scored (or skipped) games are history; only unplayed games lose seats.
        if (game.skipped || parseGameScores(game)) return game
        const seats = [...game.teamA, ...game.teamB]
        const cleared = seats.filter((id) => id === playerId).length
        if (cleared === 0) return game
        clearedSeats += cleared
        return {
          ...game,
          teamA: [blankSlot(game.teamA[0]), blankSlot(game.teamA[1])] as [string, string],
          teamB: [blankSlot(game.teamB[0]), blankSlot(game.teamB[1])] as [string, string],
          sitOutIds: game.sitOutIds?.filter((id) => id !== playerId),
        }
      }),
    }))
    return {
      ...round,
      sitOutIds: round.sitOutIds.filter((id) => id !== playerId),
      order: round.order?.filter((id) => id !== playerId),
      courts,
    }
  })

  const playerIds = state.playerIds.filter((id) => id !== playerId)
  // Regenerate from before the active round so an unplayed active round is
  // rebuilt without the removed player instead of being left full of holes.
  const tail = regenerateTail(rounds, activeRoundIndex - 1, playerIds, courtCount, random)
  const satOutCounts = { ...tail.satOutCounts }
  delete satOutCounts[playerId]
  return {
    state: { ...state, courtCount, playerIds, rounds: tail.rounds, satOutCounts },
    clearedSeats,
    regeneratedRounds: tail.regenerated,
  }
}

// Change how many courts are in play mid-tournament. Rounds with played
// content are kept; rounds without any are dropped and replaced by a single
// fresh round on the new court count, seeded from the last kept round (or the
// bare roster when nothing has been played yet). Returns how many unscored
// rounds were dropped.
export function setTournamentCourts(
  state: TournamentState,
  courtCount: number,
  random: () => number = Math.random,
): { state: TournamentState; droppedRounds: number; rebuilt: boolean } {
  const courts = clampCourtCount(courtCount, state.playerIds.length)
  const kept = state.rounds.filter(roundHasProgress)
  const droppedRounds = state.rounds.length - kept.length
  if (droppedRounds === 0) {
    return { state: { ...state, courtCount: courts }, droppedRounds: 0, rebuilt: false }
  }
  const counts = countTournamentSitOuts(kept)
  const previous = kept[kept.length - 1]
  const roundNumber = previous ? previous.round + 1 : 1
  const round = previous
    ? buildRoundAfter(
        previous,
        roundNumber,
        state.playerIds,
        counts,
        courts,
        tournamentPartnerHistory(kept),
        random,
      ).round
    : buildRound(roundNumber, state.playerIds, counts, random, new Set(), courts)
  return {
    state: {
      ...state,
      courtCount: courts,
      rounds: [...kept, round],
      satOutCounts: countRoundSitOuts(round, counts),
    },
    droppedRounds,
    rebuilt: true,
  }
}
