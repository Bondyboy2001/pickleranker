import { memo, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Trophy } from 'lucide-react'
import { PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { SortableHeader } from './SortableHeader'
import { StickyPlayerBar } from './StickyPlayerBar'
import { formatSignedPoints, formatWinRate } from '../lib/format'
import { formatRating } from '../lib/scoring'
import type { PlayerStanding, SortDirection, SortKey } from '../lib/types'

const LEADERBOARD_COLUMN_COUNT = 8
const COMPACT_LEADERBOARD_ROWS = 10

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
    isNarrowViewport && !showAllRows && search.trim().length === 0 && filteredStandings.length > COMPACT_LEADERBOARD_ROWS
  const visibleStandings = useMemo(
    () => (compactRowsActive ? filteredStandings.slice(0, COMPACT_LEADERBOARD_ROWS) : filteredStandings),
    [compactRowsActive, filteredStandings],
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)')
    const updateViewport = () => setIsNarrowViewport(query.matches)

    updateViewport()
    query.addEventListener('change', updateViewport)
    return () => query.removeEventListener('change', updateViewport)
  }, [])

  return (
    <>
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
        <div className="leaderboard-toolbar">
          <PlayerSearchAutocomplete
            players={searchPlayers}
            value={search}
            onChange={onSearchChange}
            onSelect={(playerId) => {
              onPinPlayer(playerId)
              onSearchChange(searchPlayers.find((p) => p.id === playerId)?.name ?? '')
            }}
            placeholder="Search players..."
            ariaLabel="Search players"
            className="leaderboard-search"
          />
          <div className="minimum-games-filter" role="group" aria-label="Minimum games">
            {(
              [
                [0, 'All'],
                [10, '10+ games'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={minimumGames === value ? 'active' : ''}
                onClick={() => onMinimumGamesChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {isNarrowViewport && filteredStandings.length > COMPACT_LEADERBOARD_ROWS ? (
            <button
              type="button"
              className="ghost-button leaderboard-range-button"
              onClick={() => setShowAllRows((current) => !current)}
            >
              {showAllRows || search.trim().length > 0 ? 'Show top 10' : 'Show all players'}
            </button>
          ) : null}
        </div>
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
                  label="Point"
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
                    tabIndex={0}
                    onClick={() => onPlayerSelect(player.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onPlayerSelect(player.id)
                      }
                    }}
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
                      <strong>{player.name}</strong>
                      {rankMovement !== 0 ? (
                        <span
                          className={`rank-movement ${rankMovement > 0 ? 'up' : 'down'}`}
                          aria-label={`${rankMovement > 0 ? 'Up' : 'Down'} ${Math.abs(rankMovement)} since last week`}
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
                      data-label="Point"
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
            Showing the top {COMPACT_LEADERBOARD_ROWS} of {filteredStandings.length} players.
          </p>
        ) : null}
      </section>
    </>
  )
}
