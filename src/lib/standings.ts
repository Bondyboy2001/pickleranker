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
import { sortMatches } from './data'

export const DEFAULT_RATING = 3

function getInitialRating(player: Player) {
  return player.importedRating ?? player.skillLevel ?? DEFAULT_RATING
}

export type PlayerRatingWeeksMode = 'standing' | 'fromDefault'

export function getPlayerStartingRating(player: Player) {
  return getInitialRating(player)
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

    if (!match.imported) {
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
    }

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

export function buildPlayerRatingWeeks(
  playerId: string,
  data: AppData,
  mode: PlayerRatingWeeksMode = 'fromDefault',
): PlayerWeekPoint[] {
  if (data.weeklySnapshots?.length) {
    return buildPlayerSnapshotRatingWeeks(playerId, data)
  }

  const ratings = new Map<string, number>()
  data.players.forEach((player) => {
    ratings.set(
      player.id,
      mode === 'fromDefault' ? DEFAULT_RATING : getInitialRating(player),
    )
  })

  const weeks = new Map<string, PlayerWeekPoint>()

  sortMatches(data.matches).forEach((match) => {
    const affectsRating = mode === 'fromDefault' || !match.imported
    const summary = calculateMatch(match, ratings)
    const playerTeam = match.teamA.includes(playerId)
      ? 'A'
      : match.teamB.includes(playerId)
        ? 'B'
        : null

    if (playerTeam) {
      const weekKey = match.playedOn
      const existing = weeks.get(weekKey) ?? {
        key: weekKey,
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
      const won = summary.winner === playerTeam
      const change = playerTeam === 'A' ? summary.teamADelta : summary.teamBDelta

      if (affectsRating) {
        existing.change = roundRating(existing.change + change)
      }
      existing.games += 1
      existing.wins += won ? 1 : 0
      existing.losses += won ? 0 : 1
      existing.pointsFor += playerTeam === 'A' ? match.scoreA : match.scoreB
      existing.pointsAgainst += playerTeam === 'A' ? match.scoreB : match.scoreA
      weeks.set(weekKey, existing)
    }

    if (affectsRating) {
      match.teamA.forEach((id) => {
        ratings.set(id, roundRating((ratings.get(id) ?? DEFAULT_RATING) + summary.teamADelta))
      })
      match.teamB.forEach((id) => {
        ratings.set(id, roundRating((ratings.get(id) ?? DEFAULT_RATING) + summary.teamBDelta))
      })
    }
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

function buildPlayerMatchStats(playerId: string, matches: Match[]) {
  const stats = new Map<string, PlayerWeekPoint>()

  sortMatches(matches).forEach((match) => {
    const team = match.teamA.includes(playerId)
      ? 'A'
      : match.teamB.includes(playerId)
        ? 'B'
        : null
    if (!team) return

    const key = match.playedOn
    const week =
      stats.get(key) ??
      emptyPlayerWeekPoint(key, match.week.replace(/^Results\s+/, ''), match.playedOn)
    const won = team === (match.scoreA > match.scoreB ? 'A' : 'B')

    week.games += 1
    week.wins += won ? 1 : 0
    week.losses += won ? 0 : 1
    week.pointsFor += team === 'A' ? match.scoreA : match.scoreB
    week.pointsAgainst += team === 'A' ? match.scoreB : match.scoreA
    stats.set(key, week)
  })

  return stats
}

function buildPlayerSnapshotRatingWeeks(playerId: string, data: AppData) {
  const matchStats = buildPlayerMatchStats(playerId, data.matches)
  const snapshots = [...(data.weeklySnapshots ?? [])].sort((a, b) =>
    a.playedOn.localeCompare(b.playedOn),
  )
  const weeks: PlayerWeekPoint[] = []
  let previousRating = DEFAULT_RATING

  snapshots.forEach((snapshot) => {
    const snapshotPlayer = snapshot.players.find((player) => player.playerId === playerId)
    if (!snapshotPlayer) return

    const stats =
      matchStats.get(snapshot.playedOn) ??
      emptyPlayerWeekPoint(snapshot.key, snapshot.label, snapshot.playedOn)
    const rating = snapshotPlayer.rating

    weeks.push({
      ...stats,
      key: snapshot.key,
      label: snapshot.label,
      playedOn: snapshot.playedOn,
      change: roundRating(rating - previousRating),
      cumulative: roundRating(rating - DEFAULT_RATING),
    })
    previousRating = rating
  })

  const latestSnapshot = snapshots.at(-1)
  if (!latestSnapshot) return weeks

  const ratings = new Map<string, number>()
  data.players.forEach((player) => {
    ratings.set(player.id, getInitialRating(player))
  })
  latestSnapshot.players.forEach((player) => {
    ratings.set(player.playerId, player.rating)
  })

  const postSnapshotWeeks = new Map<string, PlayerWeekPoint>()
  sortMatches(data.matches)
    .filter((match) => !match.imported && match.playedOn > latestSnapshot.playedOn)
    .forEach((match) => {
      const summary = calculateMatch(match, ratings)
      const playerTeam = match.teamA.includes(playerId)
        ? 'A'
        : match.teamB.includes(playerId)
          ? 'B'
          : null

      if (playerTeam) {
        const week =
          postSnapshotWeeks.get(match.playedOn) ??
          emptyPlayerWeekPoint(
            match.playedOn,
            match.week.replace(/^Results\s+/, ''),
            match.playedOn,
          )
        const won = summary.winner === playerTeam
        const change = playerTeam === 'A' ? summary.teamADelta : summary.teamBDelta

        week.change = roundRating(week.change + change)
        week.games += 1
        week.wins += won ? 1 : 0
        week.losses += won ? 0 : 1
        week.pointsFor += playerTeam === 'A' ? match.scoreA : match.scoreB
        week.pointsAgainst += playerTeam === 'A' ? match.scoreB : match.scoreA
        postSnapshotWeeks.set(match.playedOn, week)
      }

      match.teamA.forEach((id) => {
        ratings.set(id, roundRating((ratings.get(id) ?? DEFAULT_RATING) + summary.teamADelta))
      })
      match.teamB.forEach((id) => {
        ratings.set(id, roundRating((ratings.get(id) ?? DEFAULT_RATING) + summary.teamBDelta))
      })
    })

  let cumulative = weeks.at(-1)?.cumulative ?? 0
  ;[...postSnapshotWeeks.values()]
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))
    .forEach((week) => {
      cumulative = roundRating(cumulative + week.change)
      weeks.push({ ...week, cumulative })
    })

  return weeks
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
  matches: Match[],
  snapshots: WeeklySnapshot[] = [],
) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const standings = new Map<string, WeeklyStanding>()
  const snapshotChanges = buildSnapshotRatingChanges(snapshots).get(selectedWeek)
  const snapshotRatings = snapshots
    .find((snapshot) => snapshot.key === selectedWeek)
    ?.players.reduce((ratings, player) => {
      ratings.set(player.playerId, player.rating)
      return ratings
    }, new Map<string, number>())
  const replayRatings = snapshotRatings
    ? null
    : buildWeekEndRatings(selectedWeek, players, matches, snapshots)

  players.forEach((player) => {
    standings.set(player.id, {
      playerId: player.id,
      name: player.name,
      rating:
        snapshotRatings?.get(player.id) ??
        replayRatings?.get(player.id) ??
        getInitialRating(player),
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
          rating:
            snapshotRatings?.get(playerId) ??
            replayRatings?.get(playerId) ??
            DEFAULT_RATING,
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

  if (snapshotChanges) {
    standings.forEach((standing, playerId) => {
      const snapshotChange = snapshotChanges.get(playerId)
      if (snapshotChange !== undefined && snapshotChange !== null) {
        standing.change = snapshotChange
      }
    })
  }

  return [...standings.values()].sort(
    (a, b) =>
      b.change - a.change ||
      b.wins - a.wins ||
      b.games - a.games ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.name.localeCompare(b.name),
  )
}

function buildSnapshotRatingChanges(snapshots: WeeklySnapshot[]) {
  const changesByWeek = new Map<string, Map<string, number | null>>()
  const previousRatingByPlayer = new Map<string, number>()

  const chronologicalSnapshots = [...snapshots].sort((a, b) =>
    a.playedOn.localeCompare(b.playedOn),
  )

  chronologicalSnapshots.forEach((snapshot) => {
    const weekChanges = new Map<string, number | null>()

    snapshot.players.forEach((player) => {
      const previousRating = previousRatingByPlayer.get(player.playerId)
      weekChanges.set(
        player.playerId,
        previousRating === undefined ? null : roundRating(player.rating - previousRating),
      )
    })
    snapshot.players.forEach((player) => {
      previousRatingByPlayer.set(player.playerId, player.rating)
    })
    changesByWeek.set(snapshot.key, weekChanges)
  })

  return changesByWeek
}

function buildWeekStartRatings(
  selectedWeek: string,
  players: Player[],
  matches: Match[],
  snapshots: WeeklySnapshot[] = [],
) {
  const ratings = new Map(players.map((player) => [player.id, getInitialRating(player)]))
  const previousSnapshotDates = snapshots
    .filter((snapshot) => snapshot.playedOn < selectedWeek)
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))

  previousSnapshotDates.forEach((snapshot) => {
    snapshot.players.forEach((player) => {
      ratings.set(player.playerId, player.rating)
    })
  })

  const latestSnapshotDate = previousSnapshotDates.at(-1)?.playedOn

  sortMatches(matches)
    .filter(
      (match) =>
        !match.imported &&
        match.playedOn < selectedWeek &&
        (!latestSnapshotDate || match.playedOn > latestSnapshotDate),
    )
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

function buildWeekEndRatings(
  selectedWeek: string,
  players: Player[],
  matches: Match[],
  snapshots: WeeklySnapshot[] = [],
) {
  const ratings = buildWeekStartRatings(selectedWeek, players, matches, snapshots)

  sortMatches(matches)
    .filter((match) => !match.imported && match.playedOn === selectedWeek)
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
  snapshots: WeeklySnapshot[] = [],
) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const ratings = buildWeekStartRatings(selectedWeek, players, matches, snapshots)
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

export function sortWeeklyStandings(
  standings: WeeklyStanding[],
  key: WeeklySortKey,
  direction: SortDirection,
) {
  const directionMultiplier = direction === 'asc' ? 1 : -1
  const ranked = standings.map((player, rankIndex) => ({ player, rankIndex }))

  return ranked
    .sort((a, b) => {
      let result = 0
      if (key === 'rank') {
        result =
          b.player.rating - a.player.rating ||
          b.player.change - a.player.change ||
          b.player.wins - a.player.wins ||
          a.player.name.localeCompare(b.player.name)
      }
      if (key === 'player') result = a.player.name.localeCompare(b.player.name)
      if (key === 'rating') result = a.player.rating - b.player.rating
      if (key === 'weeklyChange') result = a.player.change - b.player.change
      if (key === 'recordDiff') {
        result =
          a.player.wins - a.player.losses - (b.player.wins - b.player.losses) ||
          a.player.change - b.player.change
      }
      return result * directionMultiplier || a.rankIndex - b.rankIndex
    })
    .map((item) => item.player)
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
      if (key === 'pointDiff') result = (a.player.pointsFor - a.player.pointsAgainst) - (b.player.pointsFor - b.player.pointsAgainst)
      return result * directionMultiplier || a.rankIndex - b.rankIndex
    })
    .map((item) => item.player)
}
