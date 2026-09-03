import { memo, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Trophy } from 'lucide-react'
import { PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { SortableHeader } from './SortableHeader'
import { StickyPlayerBar } from './StickyPlayerBar'
import { formatSignedPoints, formatWinRate } from '../lib/format'
import { formatRating } from '../lib/scoring'
import { buildPublicRoute } from '../lib/routing'
import type { PlayerStanding, SortDirection, SortKey } from '../lib/types'

const LEADERBOARD_COLUMN_COUNT = 8
const COMPACT_LEADERBOARD_ROWS = 10
const MOBILE_SORT_OPTIONS: Array<{
  label: string
  key: SortKey
  direction: SortDirection
}> = [
  { label: 'Rank: highest first', key: 'rank', direction: 'asc' },
  { label: 'Rank: lowest first', key: 'rank', direction: 'desc' },
  { label: '4DR: highest first', key: 'rating', direction: 'desc' },
  { label: '4DR: lowest first', key: 'rating', direction: 'asc' },
  { label: 'Win rate: highest first', key: 'record', direction: 'desc' },
  { label: 'Win rate: lowest first', key: 'record', direction: 'asc' },
  { label: 'Wins: most first', key: 'wins', direction: 'desc' },
  { label: 'Wins: fewest first', key: 'wins', direction: 'asc' },
  { label: 'Losses: fewest first', key: 'losses', direction: 'asc' },
  { label: 'Losses: most first', key: 'losses', direction: 'desc' },
  { label: 'Games: most first', key: 'games', direction: 'desc' },
  { label: 'Games: fewest first', key: 'games', direction: 'asc' },
  { label: 'Point diff.: highest first', key: 'pointDiff', direction: 'desc' },
  { label: 'Point diff.: lowest first', key: 'pointDiff', direction: 'asc' },
  { label: 'Player A–Z', key: 'player', direction: 'asc' },
  { label: 'Player Z–A', key: 'player', direction: 'desc' },
]

type OverallLeaderboardProps = {
  standings: PlayerStanding[]
  sortedStandings: PlayerStanding[]
  filteredStandings: PlayerStanding[]
  rankByPlayerId: Map<string, number>
  standingByPlayerId: Map<string, PlayerStanding>
  search: string
  onSearchChange: (value: string) => void
  minimumGames: number
  onMinimumGamesChange: (value: number) => void
  onPlayerSelect: (playerId: string) => void
  pinnedPlayerId: string | null
  onPinPlayer: (playerId: string | null) => void
  sort: { key: SortKey; direction: SortDirection }
  onToggleSort: (key: SortKey) => void
  onSortChange: (sort: { key: SortKey; direction: SortDirection }) => void
  rankMovementByPlayerId: Map<string, number>
  playerCount: number
  matchCount: number
  averageRating: number
  mostImprovedPlayer: { name: string; change: number } | null
  lastUpdated: string
}

export const OverallLeaderboard = memo(OverallLeaderboardBase)

function OverallLeaderboardBase({
  standings,
  sortedStandings,
  filteredStandings,
  rankByPlayerId,
  standingByPlayerId,
  search,
  onSearchChange,
  minimumGames,
  onMinimumGamesChange,
  onPlayerSelect,
  pinnedPlayerId,
  onPinPlayer,
  sort,
  onToggleSort,
  onSortChange,
  rankMovementByPlayerId,
  playerCount,
  matchCount,
  averageRating,
  mostImprovedPlayer,
  lastUpdated,
}: OverallLeaderboardProps) {
  const [isNarrowViewport, setIsNarrowViewport] = useState(false)
  const [showAllRows, setShowAllRows] = useState(false)
  const searchPlayers = useMemo(
    () => standings.map((player) => ({ id: player.id, name: player.name })),
    [standings],
  )
  const pinnedPlayer = pinnedPlayerId ? (standingByPlayerId.get(pinnedPlayerId) ?? null) : null
  const pinnedRank = pinnedPlayer ? (rankByPlayerId.get(pinnedPlayer.id) ?? 0) : 0
  const compactRowsActive =
    isNarrowViewport &&
    !showAllRows &&
    search.trim().length === 0 &&
    filteredStandings.length > COMPACT_LEADERBOARD_ROWS
  const visibleStandings = useMemo(
    () => (compactRowsActive ? filteredStandings.slice(0, COMPACT_LEADERBOARD_ROWS) : filteredStandings),
    [compactRowsActive, filteredStandings],
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 680px)')
    const updateViewport = () => setIsNarrowViewport(query.matches)

    updateViewport()
    query.addEventListener('change', updateViewport)
    return () => query.removeEventListener('change', updateViewport)
  }, [])

  return (
    <div className="overall-leaderboard">
      <h1 className="visually-hidden">David Lloyd Cardiff pickleball leaderboard</h1>
      <section className="panel leaderboard-toolbar-panel" aria-label="Find a player">
        <div className="leaderboard-toolbar">
          <PlayerSearchAutocomplete
            players={searchPlayers}
            value={search}
            onChange={onSearchChange}
            onSelect={(playerId) => {
              onPinPlayer(playerId)
              onSearchChange(searchPlayers.find((p) => p.id === playerId)?.name ?? '')
            }}
            placeholder="Find my ranking…"
            ariaLabel="Find my ranking"
            className="leaderboard-search"
          />
          {search.trim() ? (
            <button
              type="button"
              className="ghost-button leaderboard-clear-button"
              onClick={() => {
                onSearchChange('')
                onPinPlayer(null)
              }}
            >
              Clear
            </button>
          ) : null}
          <div className="minimum-games-filter" role="group" aria-label="Leaderboard eligibility">
            {(
              [
                [10, 'Qualified (10+ games)'],
                [0, 'All players'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={minimumGames === value ? 'active' : ''}
                aria-pressed={minimumGames === value}
                onClick={() => onMinimumGamesChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {isNarrowViewport ? (
            <label className="mobile-leaderboard-sort">
              <span>Sort by</span>
              <select
                aria-label="Sort leaderboard"
                value={`${sort.key}:${sort.direction}`}
                onChange={(event) => {
                  const [key, direction] = event.target.value.split(':') as [
                    SortKey,
                    SortDirection,
                  ]
                  onSortChange({ key, direction })
                  setShowAllRows(false)
                }}
              >
                {MOBILE_SORT_OPTIONS.map((option) => (
                  <option
                    key={`${option.key}:${option.direction}`}
                    value={`${option.key}:${option.direction}`}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {isNarrowViewport &&
          search.trim().length === 0 &&
          filteredStandings.length > COMPACT_LEADERBOARD_ROWS ? (
            <button
              type="button"
              className="ghost-button leaderboard-range-button"
              onClick={() => setShowAllRows((current) => !current)}
            >
              {showAllRows ? 'Show first 10' : 'Show all players'}
            </button>
          ) : null}
        </div>
      </section>

      <section className="summary-strip" aria-label="League summary">
        <div className="summary-card">
          <span className="summary-icon">
            <Trophy size={28} />
          </span>
          <div>
            <span>Most improved player</span>
            <strong>{mostImprovedPlayer?.name ?? '-'}</strong>
            <b>{mostImprovedPlayer ? formatSignedPoints(mostImprovedPlayer.change) : '-'}</b>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-icon">4DR</span>
          <div>
            <span>Average 4DR</span>
            <strong>{averageRating.toFixed(3)}</strong>
            <small>Across {playerCount} players</small>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-icon">
            <CalendarDays size={28} />
          </span>
          <div>
            <span>Latest match</span>
            <strong>{lastUpdated}</strong>
            <small>{matchCount} saved games</small>
          </div>
        </div>
      </section>

      {pinnedPlayer ? (
        <StickyPlayerBar
          name={pinnedPlayer.name}
          rank={pinnedRank}
          rating={pinnedPlayer.rating}
          onViewProfile={() => onPlayerSelect(pinnedPlayer.id)}
          onDismiss={() => onPinPlayer(null)}
        />
      ) : null}

      <section className="panel leaderboard-panel dashboard-table-panel">
        <div className="table-wrap leaderboard-table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <SortableHeader label="Rank" sortKey="rank" activeSort={sort} onSort={onToggleSort} />
                <SortableHeader
                  label="Player"
                  sortKey="player"
                  activeSort={sort}
                  onSort={onToggleSort}
                />
                <SortableHeader
                  label="4DR"
                  sortKey="rating"
                  activeSort={sort}
                  onSort={onToggleSort}
                  title="Doubles rating — higher is stronger"
                />
                <SortableHeader label="Wins" sortKey="wins" activeSort={sort} onSort={onToggleSort} />
                <SortableHeader
                  label="Losses"
                  sortKey="losses"
                  activeSort={sort}
                  onSort={onToggleSort}
                />
                <SortableHeader label="Games" sortKey="games" activeSort={sort} onSort={onToggleSort} />
                <SortableHeader
                  label="Point diff."
                  sortKey="pointDiff"
                  activeSort={sort}
                  onSort={onToggleSort}
                  title="Points scored minus points conceded"
                />
                <SortableHeader
                  label="Win %"
                  sortKey="record"
                  activeSort={sort}
                  onSort={onToggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {visibleStandings.map((player) => {
                const rank = rankByPlayerId.get(player.id) ?? 0
                const rankMovement = rankMovementByPlayerId.get(player.id) ?? 0
                const pointDiff = player.pointsFor - player.pointsAgainst
                return (
                  <tr
                    key={player.id}
                    className={`leaderboard-row${pinnedPlayerId === player.id ? ' pinned-row' : ''}`}
                  >
                    <td
                      className={`rank-cell rank-pos-${rank <= 3 ? rank : 'other'}`}
                      aria-label={rank <= 3 ? String(rank) : undefined}
                    >
                      {rank <= 3 ? (
                        <span className="rank-badge" aria-hidden="true">
                          {rank}
                        </span>
                      ) : (
                        rank
                      )}
                    </td>
                    <td className="leaderboard-player-cell">
                      <a
                        href={buildPublicRoute('players', { playerId: player.id })}
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          ) {
                            return
                          }
                          event.preventDefault()
                          onPlayerSelect(player.id)
                        }}
                      >
                        {player.name}
                      </a>
                      {rankMovement !== 0 ? (
                        <span
                          className={`rank-movement ${rankMovement > 0 ? 'up' : 'down'}`}
                          aria-label={`${rankMovement > 0 ? 'Up' : 'Down'} ${Math.abs(rankMovement)} since last week`}
                          title={`${rankMovement > 0 ? 'Up' : 'Down'} ${Math.abs(rankMovement)} place${Math.abs(rankMovement) === 1 ? '' : 's'} since last week's session`}
                        >
                          {rankMovement > 0 ? '▲' : '▼'} {Math.abs(rankMovement)}
                        </span>
                      ) : null}
                    </td>
                    <td className="rating-cell">{formatRating(player.rating)}</td>
                    <td data-label="Wins">{player.wins}</td>
                    <td data-label="Losses">{player.losses}</td>
                    <td data-label="Games">{player.games}</td>
                    <td
                      data-label="Point diff."
                      className={pointDiff > 0 ? 'positive' : pointDiff < 0 ? 'negative' : undefined}
                    >
                      {pointDiff >= 0 ? '+' : ''}
                      {pointDiff}
                    </td>
                    <td data-label="Win %">{formatWinRate(player.wins, player.games)}</td>
                  </tr>
                )
              })}
              {filteredStandings.length === 0 ? (
                <tr>
                  <td colSpan={LEADERBOARD_COLUMN_COUNT} className="empty-table">
                    {sortedStandings.length === 0
                      ? 'No players yet. Add players from the admin page.'
                      : `No players match your filters.`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {compactRowsActive ? (
          <p className="leaderboard-compact-note">
            Showing {COMPACT_LEADERBOARD_ROWS} of {filteredStandings.length} players.
          </p>
        ) : null}
      </section>
    </div>
  )
}
