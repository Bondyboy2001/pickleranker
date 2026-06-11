import { calculateMatch, probabilityForTeam, roundRating, type MatchSummary } from './scoring'
import type {
  AppData,
  Match,
  Player,
  PlayerStanding,
  PlayerWeekPoint,
  SortDirection,
  SortKey,
  WeeklyPlayerGame,
  WeeklyStanding,
} from './types'
import { sortMatches } from './data'

export const DEFAULT_RATING = 3

export function getInitialRating(player: Player) {
  return player.skillLevel ?? DEFAULT_RATING
}

export function buildStandings(data: AppData) {
  const ratings = new Map<string, number>()
  const standings = new Map<string, PlayerStanding>()

  data.players.forEach((player) => {
    const initialRating = getInitialRating(player)
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

    const teamADelta = summary.teamADelta
    const teamBDelta = summary.teamBDelta
    match.teamA.forEach((playerId) => {
      ratings.set(
        playerId,
        roundRating((ratings.get(playerId) ?? DEFAULT_RATING) + teamADelta),
      )
    })
    match.teamB.forEach((playerId) => {
      ratings.set(
        playerId,
        roundRating((ratings.get(playerId) ?? DEFAULT_RATING) + teamBDelta),
      )
    })

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
    standings: [...standings.values()].sort((a, b) => b.rating - a.rating),
    summaries: summaries.reverse(),
  }
}

export function buildPlayerWeekPoints(playerId: string, summaries: MatchSummary[]) {
  const weeks = new Map<string, PlayerWeekPoint>()
  const chronological = [...summaries].reverse()

  chronological.forEach((match) => {
    const team = match.teamA.includes(playerId)
      ? 'A'
      : match.teamB.includes(playerId)
        ? 'B'
        : null
    if (!team) return

    const key = match.playedOn
    const existing = weeks.get(key) ?? {
      key,
      label: match.week.replace(/^Results\s+/, ''),
      playedOn: match.playedOn,
      change: 0,
      cumulative: 0,
      games: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    }

    const won = match.winner === team
    const change = team === 'A' ? match.teamADelta : match.teamBDelta
    existing.change = roundRating(existing.change + change)
    existing.games += 1
    existing.wins += won ? 1 : 0
    existing.losses += won ? 0 : 1
    existing.pointsFor += team === 'A' ? match.scoreA : match.scoreB
    existing.pointsAgainst += team === 'A' ? match.scoreB : match.scoreA
    weeks.set(key, existing)
  })

  let cumulative = 0
  return [...weeks.values()]
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))
    .map((week) => {
      cumulative = roundRating(cumulative + week.change)
      return { ...week, cumulative }
    })
}

export function buildWeekOptions(summaries: MatchSummary[]) {
  const weeks = new Map<string, { key: string; label: string; playedOn: string }>()
  summaries.forEach((match) => {
    const key = match.playedOn
    if (!weeks.has(key)) {
      weeks.set(key, {
        key,
        label: match.week.replace(/^Results\s+/, ''),
        playedOn: match.playedOn,
      })
    }
  })
  return [...weeks.values()].sort((a, b) => b.playedOn.localeCompare(a.playedOn))
}

export function buildWeeklyStandings(
  selectedWeek: string,
  summaries: MatchSummary[],
  players: Player[],
) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const standings = new Map<string, WeeklyStanding>()

  players.forEach((player) => {
    standings.set(player.id, {
      playerId: player.id,
      name: player.name,
      change: 0,
      wins: 0,
      losses: 0,
      games: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    })
  })

  summaries
    .filter((match) => match.playedOn === selectedWeek)
    .forEach((match) => {
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

function buildWeekStartRatings(selectedWeek: string, players: Player[], matches: Match[]) {
  const ratings = new Map(
    players.map((player) => [player.id, player.skillLevel ?? DEFAULT_RATING]),
  )

  sortMatches(matches)
    .filter((match) => match.playedOn < selectedWeek)
    .forEach((match) => {
      const summary = calculateMatch(match, ratings)
      match.teamA.forEach((matchPlayerId) => {
        ratings.set(
          matchPlayerId,
          roundRating(
            (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamADelta,
          ),
        )
      })
      match.teamB.forEach((matchPlayerId) => {
        ratings.set(
          matchPlayerId,
          roundRating(
            (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamBDelta,
          ),
        )
      })
    })

  return ratings
}

export function buildWeeklyPlayerGames(
  playerId: string,
  selectedWeek: string,
  matches: Match[],
  players: Player[],
) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const ratings = buildWeekStartRatings(selectedWeek, players, matches)
  const games: WeeklyPlayerGame[] = []

  sortMatches(matches)
    .filter((match) => match.playedOn === selectedWeek)
    .forEach((match, index) => {
      const summary = calculateMatch(match, ratings)
      const teamAWinProbability = probabilityForTeam(
        summary.teamAStart,
        summary.teamBStart,
      )
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

      if (match.teamA.includes(playerId) || match.teamB.includes(playerId)) {
        const selectedTeam = match.teamA.includes(playerId) ? 'A' : 'B'
        const ratingChange =
          selectedTeam === 'A' ? summary.teamADelta : summary.teamBDelta

        games.push({
          id: match.id,
          gameNumber: index + 1,
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

      match.teamA.forEach((matchPlayerId) => {
        ratings.set(
          matchPlayerId,
          roundRating(
            (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamADelta,
          ),
        )
      })
      match.teamB.forEach((matchPlayerId) => {
        ratings.set(
          matchPlayerId,
          roundRating(
            (ratings.get(matchPlayerId) ?? DEFAULT_RATING) + summary.teamBDelta,
          ),
        )
      })
    })

  return games
}

export function sortStandings(
  standings: PlayerStanding[],
  key: SortKey,
  direction: SortDirection,
) {
  const directionMultiplier = direction === 'asc' ? 1 : -1
  const ranked = standings.map((player, rankIndex) => ({ player, rankIndex }))

  return ranked
    .sort((a, b) => {
      let result = 0
      if (key === 'rank') result = a.rankIndex - b.rankIndex
      if (key === 'player') result = a.player.name.localeCompare(b.player.name)
      if (key === 'rating') result = a.player.rating - b.player.rating
      if (key === 'record') {
        const aRate = a.player.games ? a.player.wins / a.player.games : 0
        const bRate = b.player.games ? b.player.wins / b.player.games : 0
        result = aRate - bRate || a.player.wins - b.player.wins
      }
      if (key === 'wins') result = a.player.wins - b.player.wins
      if (key === 'losses') result = a.player.losses - b.player.losses
      if (key === 'games') result = a.player.games - b.player.games
      return result * directionMultiplier || a.rankIndex - b.rankIndex
    })
    .map((item) => item.player)
}
