import { CalendarDays, Trophy } from 'lucide-react'
import { PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { SortableHeader } from './SortableHeader'
import { ColumnLegend } from './ColumnLegend'
import { RecentActivity } from './RecentActivity'
import { StickyPlayerBar } from './StickyPlayerBar'
import { formatSignedPoints, formatWinRate } from '../lib/format'
import { formatRating } from '../lib/scoring'
import type { Match, PlayerStanding, SortDirection, SortKey } from '../lib/types'

const LEADERBOARD_COLUMN_COUNT = 8
const MIN_GAMES_STORAGE_KEY = 'pickleranker-min-games'

export function readMinGamesFilter(): number {
  if (typeof localStorage === 'undefined') return 0
  const stored = localStorage.getItem(MIN_GAMES_STORAGE_KEY)
  const value = stored ? Number(stored) : 0
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export function writeMinGamesFilter(value: number) {
  localStorage.setItem(MIN_GAMES_STORAGE_KEY, String(value))
}

type OverallLeaderboardProps = {
  standings: PlayerStanding[]
  sortedStandings: PlayerStanding[]
  filteredStandings: PlayerStanding[]
  rankByPlayerId: Map<string, number>
  search: string
  onSearchChange: (value: string) => void
  onPlayerSelect: (playerId: string) => void
  pinnedPlayerId: string | null
  onPinPlayer: (playerId: string | null) => void
  sort: { key: SortKey; direction: SortDirection }
  onToggleSort: (key: SortKey) => void
  minGames: number
  onMinGamesChange: (value: number) => void
  playerCount: number
  matchCount: number
  recentMatches: Match[]
  playerNameById: Map<string, string>
  averageRating: number
  mostImprovedPlayer: { name: string; change: number } | null
  lastUpdated: string
}

export function OverallLeaderboard({
  standings,
  sortedStandings,
  filteredStandings,
  rankByPlayerId,
  search,
  onSearchChange,
  onPlayerSelect,
  pinnedPlayerId,
  onPinPlayer,
  sort,
  onToggleSort,
  minGames,
  onMinGamesChange,
  playerCount,
  matchCount,
  recentMatches,
  playerNameById,
  averageRating,
  mostImprovedPlayer,
  lastUpdated,
}: OverallLeaderboardProps) {
  const searchPlayers = standings.map((player) => ({ id: player.id, name: player.name }))
  const pinnedPlayer = pinnedPlayerId
    ? standings.find((player) => player.id === pinnedPlayerId)
    : null
  const pinnedRank = pinnedPlayer ? (rankByPlayerId.get(pinnedPlayer.id) ?? 0) : 0

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
            <span>Last updated</span>
            <strong>{lastUpdated}</strong>
            <small>{matchCount} saved games</small>
          </div>
        </div>
      </section>

      <RecentActivity matches={recentMatches} playerNameById={playerNameById} limit={5} />

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
          <label className="min-games-filter">
            <span>Min games</span>
            <select
              value={minGames}
              onChange={(event) => onMinGamesChange(Number(event.target.value))}
              aria-label="Minimum games to show"
            >
              <option value={0}>All players</option>
              <option value={1}>1+</option>
              <option value={3}>3+</option>
              <option value={5}>5+</option>
            </select>
          </label>
        </div>
        <ColumnLegend />
        <div className="table-wrap leaderboard-table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <SortableHeader label="#" sortKey="rank" activeSort={sort} onSort={onToggleSort} />
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
              {filteredStandings.map((player) => {
                const rank = rankByPlayerId.get(player.id) ?? 0
                const lowSample = minGames > 0 && player.games < minGames
                return (
                  <tr
                    key={player.id}
                    className={`leaderboard-row${lowSample ? ' low-sample' : ''}${pinnedPlayerId === player.id ? ' pinned-row' : ''}`}
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
                      data-rank={rank}
                      className={`rank-cell rank-pos-${rank <= 3 ? rank : 'other'}`}
                    >
                      {rank}
                    </td>
                    <td>
                      <div className="player-cell">
                        <span className="player-avatar" aria-hidden="true">
                          {player.name.slice(0, 1)}
                        </span>
                        <strong>{player.name}</strong>
                      </div>
                    </td>
                    <td className="rating-cell">{formatRating(player.rating)}</td>
                    <td>{player.wins}</td>
                    <td>{player.losses}</td>
                    <td>{player.games}</td>
                    <td>
                      {player.pointsFor - player.pointsAgainst >= 0 ? '+' : ''}
                      {player.pointsFor - player.pointsAgainst}
                    </td>
                    <td>{formatWinRate(player.wins, player.games)}</td>
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
      </section>
    </>
  )
}
