import { memo, useEffect, useMemo, useState } from 'react'
import { PlayerAutocomplete, PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { RatingChart } from './RatingChart'
import {
  buildPlayerRatingWeeks,
  DEFAULT_RATING,
} from '../lib/standings'
import { formatRating } from '../lib/scoring'
import { playerTeam, sortMatches } from '../lib/data'
import { formatSignedPoints, formatWinRate, weekLabel } from '../lib/format'
import { buildPublicRoute } from '../lib/routing'
import type { AppData, Match, PlayerStanding, PlayerWeekPoint, SortDirection } from '../lib/types'

type MatchupStat = {
  playerId: string
  name: string
  wins: number
  losses: number
  games: number
}

type PartnerStat = {
  playerId: string
  name: string
  wins: number
  games: number
  rate: number
}

type HeadToHeadStats = {
  games: number
  winsA: number
  winsB: number
  pointsA: number
  pointsB: number
  latest: Match | null
  sharedMatches: Match[]
}

type HistorySortKey = 'week' | 'games' | 'record' | 'points' | 'change'
type HistorySort = {
  key: HistorySortKey
  direction: SortDirection
}

function weekWinRate(week: PlayerWeekPoint) {
  return week.games ? week.wins / week.games : 0
}

const HISTORY_COMPARATORS: Record<
  HistorySortKey,
  (left: PlayerWeekPoint, right: PlayerWeekPoint) => number
> = {
  // playedOn is ISO (YYYY-MM-DD), so string order is date order — no Date needed.
  week: (left, right) => left.playedOn.localeCompare(right.playedOn),
  games: (left, right) => left.games - right.games,
  record: (left, right) =>
    weekWinRate(left) - weekWinRate(right) ||
    left.wins - right.wins ||
    left.games - right.games,
  points: (left, right) =>
    left.pointsFor - left.pointsAgainst - (right.pointsFor - right.pointsAgainst) ||
    left.pointsFor - right.pointsFor,
  change: (left, right) => left.change - right.change,
}

function sortPlayerHistory(weeks: PlayerWeekPoint[], sort: HistorySort) {
  const directionMultiplier = sort.direction === 'asc' ? 1 : -1
  const compare = HISTORY_COMPARATORS[sort.key]

  return [...weeks].sort(
    (left, right) =>
      compare(left, right) * directionMultiplier || right.playedOn.localeCompare(left.playedOn),
  )
}

function HistorySortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string
  sortKey: HistorySortKey
  activeSort: HistorySort
  onSort: (key: HistorySortKey) => void
}) {
  const isActive = activeSort.key === sortKey
  return (
    <th
      scope="col"
      aria-sort={isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={isActive ? 'sort-button active' : 'sort-button'}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span>{isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

function compareByName(left: MatchupStat, right: MatchupStat) {
  return left.name.localeCompare(right.name) || left.playerId.localeCompare(right.playerId)
}

function buildMatchupStats(playerId: string, data: AppData) {
  const playerNames = new Map(data.players.map((player) => [player.id, player.name]))
  const matchups = new Map<string, MatchupStat>()

  data.matches.forEach((match) => {
    const team = playerTeam(match, playerId)
    if (!team) return

    const won = team === (match.scoreA > match.scoreB ? 'A' : 'B')
    const opponents = team === 'A' ? match.teamB : match.teamA

    opponents.forEach((opponentId) => {
      const matchup = matchups.get(opponentId) ?? {
        playerId: opponentId,
        name: playerNames.get(opponentId) ?? 'Unknown',
        wins: 0,
        losses: 0,
        games: 0,
      }

      matchup.games += 1
      matchup.wins += won ? 1 : 0
      matchup.losses += won ? 0 : 1
      matchups.set(opponentId, matchup)
    })
  })

  const rankedMatchups = [...matchups.values()]
  const friend = [...rankedMatchups].sort(
    (a, b) =>
      b.wins - b.losses - (a.wins - a.losses) ||
      b.wins - a.wins ||
      b.games - a.games ||
      compareByName(a, b),
  )[0]
  const foe = [...rankedMatchups].sort(
    (a, b) =>
      b.losses - b.wins - (a.losses - a.wins) ||
      b.losses - a.losses ||
      b.games - a.games ||
      compareByName(a, b),
  )[0]

  return { friend, foe }
}

function chronologicalPlayerResults(playerId: string, matches: Match[]) {
  return sortMatches(matches.filter((match) => playerTeam(match, playerId))).map((match) => {
    const team = playerTeam(match, playerId)
    const won = team === (match.scoreA > match.scoreB ? 'A' : 'B')
    return won ? 'W' : ('L' as 'W' | 'L')
  })
}

function buildPlayerForm(playerId: string, matches: Match[]) {
  const results = chronologicalPlayerResults(playerId, matches)
  const recent = results.slice(-5)

  let streak = 0
  let streakType: 'W' | 'L' | null = null
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (streakType === null) {
      streakType = results[i]
      streak = 1
    } else if (results[i] === streakType) {
      streak += 1
    } else {
      break
    }
  }

  return { recent, streak, streakType }
}

function buildBestPartner(playerId: string, data: AppData): PartnerStat | null {
  const playerNames = new Map(data.players.map((player) => [player.id, player.name]))
  const partners = new Map<string, { wins: number; games: number }>()

  data.matches.forEach((match) => {
    const team = playerTeam(match, playerId)
    if (!team) return
    const teammates = team === 'A' ? match.teamA : match.teamB
    const partnerId = teammates.find((id) => id !== playerId)
    if (!partnerId) return

    const won = team === (match.scoreA > match.scoreB ? 'A' : 'B')
    const entry = partners.get(partnerId) ?? { wins: 0, games: 0 }
    entry.games += 1
    entry.wins += won ? 1 : 0
    partners.set(partnerId, entry)
  })

  let best: PartnerStat | null = null
  partners.forEach((entry, partnerId) => {
    if (entry.games < 2) return
    const rate = entry.wins / entry.games
    if (
      !best ||
      rate > best.rate ||
      (rate === best.rate && entry.wins > best.wins) ||
      (rate === best.rate && entry.wins === best.wins && entry.games > best.games)
    ) {
      best = {
        playerId: partnerId,
        name: playerNames.get(partnerId) ?? 'Unknown',
        wins: entry.wins,
        games: entry.games,
        rate,
      }
    }
  })

  return best
}

function buildHeadToHeadStats(playerAId: string, playerBId: string, matches: Match[]) {
  const stats: HeadToHeadStats = {
    games: 0,
    winsA: 0,
    winsB: 0,
    pointsA: 0,
    pointsB: 0,
    latest: null,
    sharedMatches: [],
  }

  matches.forEach((match) => {
    const playerATeam = playerTeam(match, playerAId)
    const playerBTeam = playerTeam(match, playerBId)
    if (!playerATeam || !playerBTeam || playerATeam === playerBTeam) return

    const playerAPoints = playerATeam === 'A' ? match.scoreA : match.scoreB
    const playerBPoints = playerBTeam === 'A' ? match.scoreA : match.scoreB
    const playerAWon = playerAPoints > playerBPoints

    stats.games += 1
    stats.winsA += playerAWon ? 1 : 0
    stats.winsB += playerAWon ? 0 : 1
    stats.pointsA += playerAPoints
    stats.pointsB += playerBPoints
    stats.sharedMatches.push(match)
  })

  stats.sharedMatches.sort((a, b) => b.playedOn.localeCompare(a.playedOn) || b.id.localeCompare(a.id))
  stats.latest = stats.sharedMatches[0] ?? null
  return stats
}

function buildProfileStats(player: PlayerStanding, weeks: PlayerWeekPoint[]) {
  const officialRating = player.rating
  const bestWeek = weeks.reduce<PlayerWeekPoint | null>(
    (best, week) => (!best || week.change > best.change ? week : best),
    null,
  )
  const worstWeek = weeks.reduce<PlayerWeekPoint | null>(
    (worst, week) => (!worst || week.change < worst.change ? week : worst),
    null,
  )

  return {
    officialRating,
    bestWeek,
    worstWeek,
    avgPoints: player.games ? player.pointsFor / player.games : 0,
    weeksPlayed: weeks.filter((week) => week.games > 0).length,
  }
}

function countLeagueWeeks(data: AppData) {
  const weeks = new Set<string>()
  data.weeklySnapshots?.forEach((snapshot) => weeks.add(snapshot.key))
  data.matches.forEach((match) => weeks.add(match.playedOn))
  return weeks.size
}

function PlayerProfileDetail({
  data,
  player,
  rank,
  totalWeeks,
  weeks,
  onOpenWeeklyWeek,
}: {
  data: AppData
  player: PlayerStanding
  rank: number
  totalWeeks: number
  weeks: PlayerWeekPoint[]
  onOpenWeeklyWeek: (playerId: string, week: string) => void
}) {
  const stats = useMemo(() => buildProfileStats(player, weeks), [player, weeks])
  const matchups = useMemo(() => buildMatchupStats(player.id, data), [player.id, data])
  const form = useMemo(() => buildPlayerForm(player.id, data.matches), [player.id, data.matches])
  const bestPartner = useMemo(() => buildBestPartner(player.id, data), [player.id, data])
  const [historySort, setHistorySort] = useState<HistorySort>({ key: 'week', direction: 'desc' })
  const [shareLabel, setShareLabel] = useState('Share')
  const history = useMemo(() => sortPlayerHistory(weeks, historySort), [weeks, historySort])

  function toggleHistorySort(key: HistorySortKey) {
    setHistorySort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  async function sharePlayer() {
    const url = `${window.location.origin}${buildPublicRoute('players', {
      playerId: player.id,
    })}`
    const shareData = { title: `${player.name} · DL Cardiff Pickleball`, url }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(url)
      setShareLabel('Link copied!')
      window.setTimeout(() => setShareLabel('Share'), 2000)
    } catch {
      setShareLabel('Copy failed')
      window.setTimeout(() => setShareLabel('Share'), 2500)
    }
  }

  return (
    <aside className="panel players-profile-panel">
      <div className="players-profile-head">
        <div className="players-profile-identity">
          <span className="player-avatar large" aria-hidden="true">
            {player.name.slice(0, 1)}
          </span>
          <div>
            <span className="eyebrow">Player profile</span>
            <h2>{player.name}</h2>
            <p>
              Rank #{rank} · {player.games} game{player.games === 1 ? '' : 's'} played
            </p>
          </div>
        </div>
        <div className="players-profile-rating">
          <span>Leaderboard 4DR</span>
          <strong>{formatRating(stats.officialRating)}</strong>
          <button type="button" className="players-share-button" onClick={sharePlayer}>
            {shareLabel}
          </button>
        </div>
      </div>

      {form.recent.length > 0 ? (
        <div className="players-form-row">
          <span className="players-form-label">Recent form</span>
          <div className="players-form-pills" aria-label={`Last ${form.recent.length} results`}>
            {form.recent.map((result, index) => (
              <span
                key={index}
                className={`players-form-pill ${result === 'W' ? 'win' : 'loss'}`}
                title={result === 'W' ? 'Win' : 'Loss'}
              >
                {result}
              </span>
            ))}
          </div>
          {form.streakType ? (
            <span className={`players-form-streak ${form.streakType === 'W' ? 'win' : 'loss'}`}>
              {form.streak} {form.streakType === 'W' ? 'win' : 'loss'}
              {form.streak === 1 ? '' : form.streakType === 'W' ? 's' : 'es'} in a row
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="players-stat-grid">
        <div>
          <span>Record</span>
          <strong>
            {player.wins}-{player.losses}
          </strong>
        </div>
        <div>
          <span>Win rate</span>
          <strong>{formatWinRate(player.wins, player.games)}</strong>
        </div>
        <div>
          <span>Point differential</span>
          <strong>
            {player.pointsFor - player.pointsAgainst >= 0 ? '+' : ''}
            {player.pointsFor - player.pointsAgainst}
          </strong>
        </div>
        <div>
          <span>Weeks played</span>
          <strong>
            {stats.weeksPlayed}/{totalWeeks}
          </strong>
        </div>
        <div>
          <span>Toughest opponent</span>
          <strong>{matchups.foe?.name ?? '—'}</strong>
          {matchups.foe ? (
            <small>
              {matchups.foe.losses}-{matchups.foe.wins} against you
            </small>
          ) : null}
        </div>
        <div>
          <span>Best record against</span>
          <strong>{matchups.friend?.name ?? '—'}</strong>
          {matchups.friend ? (
            <small>
              {matchups.friend.wins}-{matchups.friend.losses} against them
            </small>
          ) : null}
        </div>
        <div>
          <span>Best partner</span>
          <strong>{bestPartner?.name ?? '—'}</strong>
          {bestPartner ? (
            <small>
              {formatWinRate(bestPartner.wins, bestPartner.games)} together ({bestPartner.wins}-
              {bestPartner.games - bestPartner.wins})
            </small>
          ) : null}
        </div>
        <div>
          <span>Avg points</span>
          <strong>{stats.avgPoints.toFixed(1)}</strong>
        </div>
        <div>
          <span>Best week</span>
          <strong className={stats.bestWeek && stats.bestWeek.change < 0 ? 'negative' : 'positive'}>
            {stats.bestWeek ? formatSignedPoints(stats.bestWeek.change) : '—'}
          </strong>
        </div>
        <div>
          <span>Worst week</span>
          <strong className={stats.worstWeek && stats.worstWeek.change >= 0 ? 'positive' : 'negative'}>
            {stats.worstWeek ? formatSignedPoints(stats.worstWeek.change) : '—'}
          </strong>
        </div>
        <div>
          <span>Points scored</span>
          <strong>{player.pointsFor}</strong>
        </div>
        <div>
          <span>Points conceded</span>
          <strong>{player.pointsAgainst}</strong>
        </div>
      </div>

      <RatingChart
        key={player.id}
        weeks={weeks}
        startRating={DEFAULT_RATING}
      />

      <div className="players-history">
        <div className="players-history-head">
          <h3>Weekly history</h3>
          <span>{history.length} week{history.length === 1 ? '' : 's'}</span>
        </div>
        {history.length > 0 ? (
          <div className="table-wrap">
            <table className="players-history-table">
              <thead>
                <tr>
                  <HistorySortableHeader
                    label="Week"
                    sortKey="week"
                    activeSort={historySort}
                    onSort={toggleHistorySort}
                  />
                  <HistorySortableHeader
                    label="Games"
                    sortKey="games"
                    activeSort={historySort}
                    onSort={toggleHistorySort}
                  />
                  <HistorySortableHeader
                    label="Record"
                    sortKey="record"
                    activeSort={historySort}
                    onSort={toggleHistorySort}
                  />
                  <HistorySortableHeader
                    label="Points"
                    sortKey="points"
                    activeSort={historySort}
                    onSort={toggleHistorySort}
                  />
                  <HistorySortableHeader
                    label="4DR change"
                    sortKey="change"
                    activeSort={historySort}
                    onSort={toggleHistorySort}
                  />
                </tr>
              </thead>
              <tbody>
                {history.map((week) => (
                  <tr
                    key={week.key}
                    className="players-history-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${week.label} in weekly view`}
                    onClick={() => onOpenWeeklyWeek(player.id, week.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenWeeklyWeek(player.id, week.key)
                      }
                    }}
                  >
                    <td>{week.label}</td>
                    <td>{week.games}</td>
                    <td>
                      {week.wins}-{week.losses}
                    </td>
                    <td>
                      {week.pointsFor}-{week.pointsAgainst}
                    </td>
                    <td className={week.change >= 0 ? 'positive' : 'negative'}>
                      {formatSignedPoints(week.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="players-empty-history">No weekly results recorded yet.</p>
        )}
      </div>
    </aside>
  )
}

function HeadToHeadPanel({
  data,
  standings,
  playerAId,
  playerBId,
  onChange,
}: {
  data: AppData
  standings: PlayerStanding[]
  playerAId: string
  playerBId: string
  onChange: (playerAId: string, playerBId: string) => void
}) {
  const [shareLabel, setShareLabel] = useState('Share comparison')

  const playerA = useMemo(
    () => standings.find((player) => player.id === playerAId) ?? null,
    [standings, playerAId],
  )
  const playerB = useMemo(
    () => standings.find((player) => player.id === playerBId) ?? null,
    [standings, playerBId],
  )
  const stats = useMemo(
    () =>
      playerAId && playerBId && playerAId !== playerBId
        ? buildHeadToHeadStats(playerAId, playerBId, data.matches)
        : null,
    [data.matches, playerAId, playerBId],
  )
  const playerAStatus = stats
    ? stats.winsA > stats.winsB
      ? 'winning'
      : stats.winsA < stats.winsB
        ? 'losing'
        : 'tied'
    : 'tied'
  const playerBStatus = stats
    ? stats.winsB > stats.winsA
      ? 'winning'
      : stats.winsB < stats.winsA
        ? 'losing'
        : 'tied'
    : 'tied'

  async function shareComparison() {
    if (!playerA || !playerB) return
    const url = `${window.location.origin}${buildPublicRoute('players', {
      playerId: playerA.id,
      comparePlayerAId: playerA.id,
      comparePlayerBId: playerB.id,
    })}`
    const shareData = {
      title: `${playerA.name} vs ${playerB.name} · DL Cardiff Pickleball`,
      text: `${playerA.name} and ${playerB.name} head to head`,
      url,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(url)
      setShareLabel('Link copied!')
      window.setTimeout(() => setShareLabel('Share comparison'), 2000)
    } catch {
      setShareLabel('Copy failed — long-press the URL')
      window.setTimeout(() => setShareLabel('Share comparison'), 2500)
    }
  }

  return (
    <section className="panel head-to-head-panel">
      <div className="head-to-head-head">
        <div>
          <span className="eyebrow">Head to head</span>
          <h2>Compare players</h2>
          <p className="head-to-head-note">Only games on opposite teams count — same-team games are ignored.</p>
        </div>
        {playerA && playerB && stats ? (
          <button
            type="button"
            className="players-share-button head-to-head-share-button"
            onClick={shareComparison}
          >
            {shareLabel}
          </button>
        ) : null}
      </div>

      <div className="head-to-head-inputs">
        <PlayerAutocomplete
          players={standings}
          value={playerAId}
          onChange={(nextPlayerAId) => onChange(nextPlayerAId, playerBId)}
          excludeIds={playerBId ? [playerBId] : []}
          placeholder="First player"
        />
        <PlayerAutocomplete
          players={standings}
          value={playerBId}
          onChange={(nextPlayerBId) => onChange(playerAId, nextPlayerBId)}
          excludeIds={playerAId ? [playerAId] : []}
          placeholder="Second player"
        />
      </div>

      {playerA && playerB && stats ? (
        <div className="head-to-head-results">
          <div className={`head-to-head-player-card ${playerAStatus}`}>
            <div className="head-to-head-player-top">
              <span>{playerA.name}</span>
              <strong>{formatWinRate(stats.winsA, stats.games)}</strong>
            </div>
            <b>{stats.winsA}</b>
          </div>

          <div className={`head-to-head-player-card ${playerBStatus}`}>
            <div className="head-to-head-player-top">
              <span>{playerB.name}</span>
              <strong>{formatWinRate(stats.winsB, stats.games)}</strong>
            </div>
            <b>{stats.winsB}</b>
          </div>

          <div className="head-to-head-summary">
            <div>
              <span>Games</span>
              <strong>{stats.games}</strong>
            </div>
            <div>
              <span>Total points</span>
              <strong>
                {stats.pointsA}-{stats.pointsB}
              </strong>
            </div>
            <div>
              <span>Avg points</span>
              <strong>
                {stats.games ? (stats.pointsA / stats.games).toFixed(1) : '0.0'} /{' '}
                {stats.games ? (stats.pointsB / stats.games).toFixed(1) : '0.0'}
              </strong>
            </div>
            <div>
              <span>Latest</span>
              <strong>
                {stats.latest
                  ? `${playerTeam(stats.latest, playerA.id) === 'A' ? stats.latest.scoreA : stats.latest.scoreB}-${playerTeam(stats.latest, playerB.id) === 'A' ? stats.latest.scoreA : stats.latest.scoreB}`
                  : '—'}
              </strong>
              {stats.latest ? <small>{weekLabel(stats.latest.week)}</small> : null}
            </div>
          </div>

          {stats.sharedMatches.length > 0 ? (
            <ul className="head-to-head-games">
              {stats.sharedMatches.map((match) => {
                const scoreA = playerTeam(match, playerA.id) === 'A' ? match.scoreA : match.scoreB
                const scoreB = playerTeam(match, playerB.id) === 'A' ? match.scoreA : match.scoreB
                const playerAWon = scoreA > scoreB
                return (
                  <li key={match.id}>
                    <span>{weekLabel(match.week)}</span>
                    <strong className={playerAWon ? 'positive' : 'negative'}>
                      {scoreA}-{scoreB}
                    </strong>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="head-to-head-empty">Select two players.</p>
      )}
    </section>
  )
}

export const PlayersPanel = memo(PlayersPanelBase)

function PlayersPanelBase({
  data,
  standings,
  rankByPlayerId,
  selectedPlayerId,
  comparePlayerAId,
  comparePlayerBId,
  onSelectPlayer,
  onComparisonChange,
  onOpenWeeklyWeek,
}: {
  data: AppData
  standings: PlayerStanding[]
  rankByPlayerId: Map<string, number>
  selectedPlayerId: string | null
  comparePlayerAId: string
  comparePlayerBId: string
  onSelectPlayer: (playerId: string) => void
  onComparisonChange: (playerAId: string, playerBId: string) => void
  onOpenWeeklyWeek: (playerId: string, week: string) => void
}) {
  const [search, setSearch] = useState('')
  const effectiveSelectedPlayerId = selectedPlayerId

  const selectedPlayer = useMemo(
    () => standings.find((player) => player.id === effectiveSelectedPlayerId) ?? null,
    [effectiveSelectedPlayerId, standings],
  )

  const selectedWeeks = useMemo(
    () => (selectedPlayer ? buildPlayerRatingWeeks(selectedPlayer.id, data) : []),
    [selectedPlayer, data],
  )
  const totalWeeks = useMemo(() => countLeagueWeeks(data), [data])

  const searchPlayers = standings.map((player) => ({ id: player.id, name: player.name }))

  useEffect(() => {
    if (selectedPlayer) setSearch(selectedPlayer.name)
  }, [selectedPlayer])

  return (
    <div className={selectedPlayer ? 'players-workspace' : 'players-workspace no-profile'}>
      <h1 className="visually-hidden">Cardiff pickleball player profiles and head-to-head</h1>
      <section className="panel players-list-panel">
        <div className="panel-heading players-heading">
          <div className="players-search-copy">
            <span className="eyebrow">Player profiles</span>
            <h2>Find a player</h2>
          </div>
          <PlayerSearchAutocomplete
            players={searchPlayers}
            value={search}
            onChange={setSearch}
            onSelect={onSelectPlayer}
            placeholder="Search by player name…"
            ariaLabel="Find your player profile"
            className="players-search"
          />
        </div>
      </section>

      {selectedPlayer ? (
        <PlayerProfileDetail
          data={data}
          player={selectedPlayer}
          rank={rankByPlayerId.get(selectedPlayer.id) ?? 0}
          totalWeeks={totalWeeks}
          weeks={selectedWeeks}
          onOpenWeeklyWeek={onOpenWeeklyWeek}
        />
      ) : null}

      <HeadToHeadPanel
        data={data}
        standings={standings}
        playerAId={comparePlayerAId}
        playerBId={comparePlayerBId}
        onChange={onComparisonChange}
      />
    </div>
  )
}
