import { memo } from 'react'
import { CalendarDays, Trophy } from 'lucide-react'
import { PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { SortableHeader } from './SortableHeader'
import { RecentActivity } from './RecentActivity'
import { StickyPlayerBar } from './StickyPlayerBar'
import { formatSignedPoints, formatWinRate } from '../lib/format'
import { formatRating } from '../lib/scoring'
import type { Match, PlayerStanding, SortDirection, SortKey } from '../lib/types'

const LEADERBOARD_COLUMN_COUNT = 8

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
  playerCount: number
  matchCount: number
  recentMatches: Match[]
  playerNameById: Map<string, string>
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
  search,
  onSearchChange,
  onPlayerSelect,
  pinnedPlayerId,
  onPinPlayer,
  sort,
  onToggleSort,
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
        </div>
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
                      data-rank={rank}
                      className={`rank-cell rank-pos-${rank <= 3 ? rank : 'other'}`}
                    >
                      {rank}
                    </td>
                    <td className="leaderboard-player-cell">
                      <div className="player-cell">
                        <span className="player-avatar" aria-hidden="true">
                          {player.name.slice(0, 1)}
                        </span>
                        <strong>{player.name}</strong>
                      </div>
                    </td>
                    <td className="rating-cell">{formatRating(player.rating)}</td>
                    <td data-label="Wins">{player.wins}</td>
                    <td data-label="Losses">{player.losses}</td>
                    <td data-label="Games">{player.games}</td>
                    <td data-label="Point">
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
      </section>
    </>
  )
}
