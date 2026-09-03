import { calculateMatch, probabilityForTeam, roundRating, type MatchSummary } from './scoring'
import type {
  AppData,
  Match,
  Player,
  PlayerStanding,
  PlayerWeekPoint,
  SortDirection,
  SortKey,
  WeeklySortKey,
  WeeklyPlayerGame,
  WeeklyStanding,
  WeeklySnapshot,
} from './types'
import { playerTeam, sortMatches } from './data'
import { weekLabel } from './format'

export const DEFAULT_RATING = 3

function playerNameMap(players: Player[]) {
  return new Map(players.map((player) => [player.id, player.name]))
}

// Every game ever played counts toward the rating — including the early
// history. Every player starts at the default 3.0 and the engine replays the
// full match list in order from there.
function getInitialRating() {
  return DEFAULT_RATING
}

// Credit both teams with their rating change. Every replay in this module walks
// matches in order and applies the deltas this same way — sharing one helper is
// what keeps the replays identical, so ratings derived by different entry points
// can't drift apart.
function applyRatingDeltas(
  ratings: Map<string, number>,
  match: Match,
  summary: Pick<MatchSummary, 'teamADelta' | 'teamBDelta'>,
) {
  match.teamA.forEach((playerId) => {
    ratings.set(playerId, roundRating((ratings.get(playerId) ?? DEFAULT_RATING) + summary.teamADelta))
  })
  match.teamB.forEach((playerId) => {
    ratings.set(playerId, roundRating((ratings.get(playerId) ?? DEFAULT_RATING) + summary.teamBDelta))
  })
}

function rankPlayersByRating(players: Player[], ratings: Map<string, number>) {
  return new Map(
    [...players]
      .sort(
        (a, b) =>
          (ratings.get(b.id) ?? getInitialRating()) - (ratings.get(a.id) ?? getInitialRating()) ||
          a.name.localeCompare(b.name),
      )
      .map((player, index) => [player.id, index + 1]),
  )
}

// Players tied on rating are ordered by name everywhere, so the overall
// leaderboard order and any historical ranking we replay break ties the same
// way. Without that, tied players would swap places between the two orderings
// and show phantom up/down arrows.
function compareByRatingThenName(
  a: { rating: number; name: string },
  b: { rating: number; name: string },
) {
  return b.rating - a.rating || a.name.localeCompare(b.name)
}

export function buildStandings(data: AppData) {
  const ratings = new Map<string, number>()
  const standings = new Map<string, PlayerStanding>()

  data.players.forEach((player) => {
    const initialRating = getInitialRating()
    ratings.set(player.id, initialRating)
    standings.set(player.id, {
      ...player,
      rating: initialRating,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    })
  })

  const sortedMatches = sortMatches(data.matches)
  const summaries: MatchSummary[] = []

  sortedMatches.forEach((match) => {
    const summary = calculateMatch(match, ratings)
    summaries.push(summary)

    applyRatingDeltas(ratings, match, summary)

    match.teamA.forEach((playerId) => {
      const standing = standings.get(playerId)
      if (!standing) return
      standing.games += 1
      standing.pointsFor += match.scoreA
      standing.pointsAgainst += match.scoreB
      standing.wins += summary.winner === 'A' ? 1 : 0
      standing.losses += summary.winner === 'B' ? 1 : 0
    })
    match.teamB.forEach((playerId) => {
      const standing = standings.get(playerId)
      if (!standing) return
      standing.games += 1
      standing.pointsFor += match.scoreB
      standing.pointsAgainst += match.scoreA
      standing.wins += summary.winner === 'B' ? 1 : 0
      standing.losses += summary.winner === 'A' ? 1 : 0
    })
  })

  standings.forEach((standing, playerId) => {
    standing.rating = ratings.get(playerId) ?? standing.skillLevel
  })

  return {
    standings: [...standings.values()].sort(compareByRatingThenName),
    summaries: summaries.reverse(),
  }
}

export function buildPlayerRatingWeeks(playerId: string, data: AppData): PlayerWeekPoint[] {
  const ratings = new Map<string, number>()
  data.players.forEach((player) => {
    ratings.set(player.id, getInitialRating())
  })

  const weeks = new Map<string, PlayerWeekPoint>()

  sortMatches(data.matches).forEach((match) => {
    const summary = calculateMatch(match, ratings)
    const team = playerTeam(match, playerId)

    if (team) {
      const weekKey = match.playedOn
      const existing =
        weeks.get(weekKey) ??
        emptyPlayerWeekPoint(weekKey, weekLabel(match.week), match.playedOn)
      const change = team === 'A' ? summary.teamADelta : summary.teamBDelta

      existing.change = roundRating(existing.change + change)
      addGameToWeek(existing, match, team, summary.winner === team)
      weeks.set(weekKey, existing)
    }

    applyRatingDeltas(ratings, match, summary)
  })

  let cumulative = 0
  return [...weeks.values()]
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))
    .map((week) => {
      cumulative = roundRating(cumulative + week.change)
      return { ...week, cumulative }
    })
}

function emptyPlayerWeekPoint(key: string, label: string, playedOn: string): PlayerWeekPoint {
  return {
    key,
    label,
    playedOn,
    change: 0,
    cumulative: 0,
    games: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }
}

// Fold one of the player's games into their running week totals. The rating
// change is the caller's business — only the games/points tallies live here.
function addGameToWeek(
  week: PlayerWeekPoint,
  match: Match,
  team: 'A' | 'B',
  won: boolean,
) {
  week.games += 1
  week.wins += won ? 1 : 0
  week.losses += won ? 0 : 1
  week.pointsFor += team === 'A' ? match.scoreA : match.scoreB
  week.pointsAgainst += team === 'A' ? match.scoreB : match.scoreA
}

export function buildWeekOptions(summaries: MatchSummary[], snapshots: WeeklySnapshot[] = []) {
  const weeks = new Map<string, { key: string; label: string; playedOn: string }>()
  snapshots.forEach((snapshot) => {
    weeks.set(snapshot.key, {
      key: snapshot.key,
      label: snapshot.label,
      playedOn: snapshot.playedOn,
    })
  })
  summaries.forEach((match) => {
    const key = match.playedOn
    if (!weeks.has(key)) {
      weeks.set(key, { key, label: weekLabel(match.week), playedOn: match.playedOn })
    }
  })
  return [...weeks.values()].sort((a, b) => b.playedOn.localeCompare(a.playedOn))
}

export function buildWeeklyStandings(
  selectedWeek: string,
  summaries: MatchSummary[],
  players: Player[],
  matches: Match[],
) {
  const playerNames = playerNameMap(players)
  const standings = new Map<string, WeeklyStanding>()
  // One replay serves both ends of the week: the week-end ratings carry on from a
  // copy of the week-start map instead of walking the whole history again. Every
  // game counts, from the earliest history on.
  const sortedMatches = sortMatches(matches)
  const weekStartRatings = buildWeekStartRatings(selectedWeek, players, sortedMatches)
  const replayRatings = applyWeekMatches(selectedWeek, sortedMatches, new Map(weekStartRatings))
  const replayRanks = rankPlayersByRating(players, replayRatings)
  const weekStartRanks = rankPlayersByRating(players, weekStartRatings)
  const weekEndRanks = replayRanks
  const getRankMovement = (playerId: string, rank: number) => {
    const previousRank = weekStartRanks.get(playerId)
    return previousRank && rank ? previousRank - rank : 0
  }

  players.forEach((player) => {
    const rank = weekEndRanks.get(player.id) ?? 0
    standings.set(player.id, {
      playerId: player.id,
      name: player.name,
      rank,
      rankMovement: getRankMovement(player.id, rank),
      rating: replayRatings.get(player.id) ?? getInitialRating(),
      change: 0,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    })
  })

  summaries.forEach((match) => {
    if (match.playedOn !== selectedWeek) return

    const applyTeam = (
      playerId: string,
      team: 'A' | 'B',
      change: number,
      pointsFor: number,
      pointsAgainst: number,
    ) => {
      const won = match.winner === team
      const standing = standings.get(playerId) ?? {
        playerId,
        name: playerNames.get(playerId) ?? 'Unknown',
        rank: weekEndRanks.get(playerId) ?? 0,
        rankMovement: getRankMovement(playerId, weekEndRanks.get(playerId) ?? 0),
        rating: replayRatings.get(playerId) ?? DEFAULT_RATING,
        change: 0,
        wins: 0,
        losses: 0,
        games: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      }
      standing.change = roundRating(standing.change + change)
      standing.wins += won ? 1 : 0
      standing.losses += won ? 0 : 1
      standing.games += 1
      standing.pointsFor += pointsFor
      standing.pointsAgainst += pointsAgainst
      standings.set(playerId, standing)
    }

    match.teamA.forEach((playerId) =>
      applyTeam(playerId, 'A', match.teamADelta, match.scoreA, match.scoreB),
    )
    match.teamB.forEach((playerId) =>
      applyTeam(playerId, 'B', match.teamBDelta, match.scoreB, match.scoreA),
    )
  })

  return [...standings.values()].sort(
    (a, b) =>
      b.change - a.change ||
      b.wins - a.wins ||
      b.games - a.games ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.name.localeCompare(b.name),
  )
}

// Ratings as they stood before `selectedWeek` was played. `sortedMatches` must
// already be in play order — callers sort once and share the result across the
// several replays a weekly view needs.
function buildWeekStartRatings(
  selectedWeek: string,
  players: Player[],
  sortedMatches: Match[],
) {
  const ratings = new Map(players.map((player) => [player.id, getInitialRating()]))

  sortedMatches.forEach((match) => {
    if (match.playedOn >= selectedWeek) return

    applyRatingDeltas(ratings, match, calculateMatch(match, ratings))
  })

  return ratings
}

// Play `selectedWeek`'s matches into `ratings` (mutated and returned), turning a
// week-start map into a week-end one.
function applyWeekMatches(
  selectedWeek: string,
  sortedMatches: Match[],
  ratings: Map<string, number>,
) {
  sortedMatches.forEach((match) => {
    if (match.playedOn !== selectedWeek) return
    applyRatingDeltas(ratings, match, calculateMatch(match, ratings))
  })

  return ratings
}

// Every date the league actually played, oldest first.
function listPlayedWeeks(data: AppData) {
  const weeks = new Set<string>()
  data.matches.forEach((match) => weeks.add(match.playedOn))
  return [...weeks].sort()
}

// Ratings as they stood at the end of `week`, replayed exactly the way
// buildStandings replays them — same starting rating, every game counting.
// Deriving both ends of the comparison identically is what makes the
// difference a real rank change rather than an artefact of two methods.
function buildRatingsAsOfWeek(week: string, data: AppData) {
  const ratings = new Map(data.players.map((player) => [player.id, getInitialRating()]))

  sortMatches(data.matches).forEach((match) => {
    if (match.playedOn > week) return
    applyRatingDeltas(ratings, match, calculateMatch(match, ratings))
  })

  return ratings
}

// How far each player has moved on the overall leaderboard since the end of the
// previous playing week. `standings` supplies today's order so the movement is
// measured against the ranks the table actually renders.
//
// This deliberately replays last week's ranking from the full match list, so
// the arrows always agree with the table.
export function buildOverallRankMovement(data: AppData, standings: PlayerStanding[]) {
  const movement = new Map<string, number>()
  const weeks = listPlayedWeeks(data)
  const previousWeek = weeks.at(-2)
  if (!previousWeek) return movement

  const previousRanks = rankPlayersByRating(data.players, buildRatingsAsOfWeek(previousWeek, data))

  // Someone who first appeared this week has no rank to move from — an arrow
  // against their provisional starting rating would be meaningless.
  const rankedLastWeek = new Set<string>()
  data.matches.forEach((match) => {
    if (match.playedOn > previousWeek) return
    ;[...match.teamA, ...match.teamB].forEach((playerId) => rankedLastWeek.add(playerId))
  })

  standings.forEach((player, index) => {
    const previousRank = previousRanks.get(player.id)
    if (!previousRank || !rankedLastWeek.has(player.id)) {
      movement.set(player.id, 0)
      return
    }
    movement.set(player.id, previousRank - (index + 1))
  })

  return movement
}

export function buildWeeklyPlayerGames(
  playerId: string,
  selectedWeek: string,
  matches: Match[],
  players: Player[],
) {
  const playerNames = playerNameMap(players)
  const sortedMatches = sortMatches(matches)
  const ratings = buildWeekStartRatings(selectedWeek, players, sortedMatches)
  const games: WeeklyPlayerGame[] = []

  let selectedWeekGameIndex = 0
  sortedMatches.forEach((match) => {
    if (match.playedOn !== selectedWeek) return
    selectedWeekGameIndex += 1
    const summary = calculateMatch(match, ratings)
    const teamAWinProbability = probabilityForTeam(summary.teamAStart, summary.teamBStart)
    const makePlayer = (matchPlayerId: string, change: number) => {
      const start = ratings.get(matchPlayerId) ?? DEFAULT_RATING
      return {
        id: matchPlayerId,
        name: playerNames.get(matchPlayerId) ?? 'Unknown',
        start,
        change,
        finish: roundRating(start + change),
      }
    }
    const teamA = match.teamA.map((matchPlayerId) =>
      makePlayer(matchPlayerId, summary.teamADelta),
    )
    const teamB = match.teamB.map((matchPlayerId) =>
      makePlayer(matchPlayerId, summary.teamBDelta),
    )

    const selectedTeam = playerTeam(match, playerId)
    if (selectedTeam) {
      const ratingChange = selectedTeam === 'A' ? summary.teamADelta : summary.teamBDelta

      games.push({
        id: match.id,
        gameNumber: selectedWeekGameIndex,
        week: match.week,
        playedOn: match.playedOn,
        selectedPlayerId: playerId,
        selectedTeam,
        winner: summary.winner,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        teamAStart: summary.teamAStart,
        teamBStart: summary.teamBStart,
        teamAWinProbability,
        teamADelta: summary.teamADelta,
        teamBDelta: summary.teamBDelta,
        baseDelta: summary.baseDelta,
        teamA,
        teamB,
        result: summary.winner === selectedTeam ? 'Win' : 'Loss',
        ratingChange,
      })
    }

    applyRatingDeltas(ratings, match, summary)
  })

  return games
}

// Sorting a table always works the same way: compare on the chosen column, flip
// for direction, and fall back to the incoming order so equal rows never shuffle
// between renders. Only the per-column comparison differs, so that's all each
// table supplies.
function sortTable<Row, Key extends string>(
  rows: Row[],
  key: Key,
  direction: SortDirection,
  comparators: Record<Key, (a: Row, b: Row, aIndex: number, bIndex: number) => number>,
) {
  const directionMultiplier = direction === 'asc' ? 1 : -1
  const compare = comparators[key]

  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        compare(a.row, b.row, a.index, b.index) * directionMultiplier || a.index - b.index,
    )
    .map((entry) => entry.row)
}

const WEEKLY_COMPARATORS: Record<
  WeeklySortKey,
  (a: WeeklyStanding, b: WeeklyStanding) => number
> = {
  rank: (a, b) => a.rank - b.rank,
  player: (a, b) => a.name.localeCompare(b.name),
  rating: (a, b) => a.rating - b.rating,
  weeklyChange: (a, b) => a.change - b.change,
  rankMovement: (a, b) => a.rankMovement - b.rankMovement,
}

export function sortWeeklyStandings(
  standings: WeeklyStanding[],
  key: WeeklySortKey,
  direction: SortDirection,
) {
  return sortTable(standings, key, direction, WEEKLY_COMPARATORS)
}

function winRate(player: PlayerStanding) {
  return player.games ? player.wins / player.games : 0
}

function pointDiff(player: PlayerStanding) {
  return player.pointsFor - player.pointsAgainst
}

const STANDING_COMPARATORS: Record<
  SortKey,
  (a: PlayerStanding, b: PlayerStanding, aIndex: number, bIndex: number) => number
> = {
  // The table arrives in rank order, so the row's position *is* its rank.
  rank: (_a, _b, aIndex, bIndex) => aIndex - bIndex,
  player: (a, b) => a.name.localeCompare(b.name),
  rating: (a, b) => a.rating - b.rating,
  record: (a, b) => winRate(a) - winRate(b) || a.wins - b.wins,
  wins: (a, b) => a.wins - b.wins,
  losses: (a, b) => a.losses - b.losses,
  games: (a, b) => a.games - b.games,
  pointDiff: (a, b) => pointDiff(a) - pointDiff(b),
}

export function sortStandings(
  standings: PlayerStanding[],
  key: SortKey,
  direction: SortDirection,
) {
  return sortTable(standings, key, direction, STANDING_COMPARATORS)
}
