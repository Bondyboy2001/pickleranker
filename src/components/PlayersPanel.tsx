import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { RatingChart } from './RatingChart'
import {
  buildPlayerRatingWeeks,
  DEFAULT_RATING,
  getPlayerStartingRating,
} from '../lib/standings'
import { formatRating, roundRating } from '../lib/scoring'
import type { AppData, PlayerStanding, PlayerWeekPoint } from '../lib/types'

function formatWinRate(wins: number, games: number) {
  if (games === 0) return '0.0%'
  return `${((wins / games) * 100).toFixed(1)}%`
}

function ratingAtWeek(week: PlayerWeekPoint) {
  return roundRating(DEFAULT_RATING + week.cumulative)
}

function buildProfileStats(player: PlayerStanding, weeks: PlayerWeekPoint[]) {
  const officialStart = getPlayerStartingRating(player)
  const officialRating = player.rating
  const replayEnd = weeks.at(-1) ? ratingAtWeek(weeks.at(-1)!) : DEFAULT_RATING
  const startingRating = DEFAULT_RATING
  const totalChange = roundRating(replayEnd - DEFAULT_RATING)
  const peakRating = weeks.reduce(
    (peak, week) => Math.max(peak, ratingAtWeek(week)),
    DEFAULT_RATING,
  )
  const bestWeek = weeks.reduce<PlayerWeekPoint | null>(
    (best, week) => (!best || week.change > best.change ? week : best),
    null,
  )
  const worstWeek = weeks.reduce<PlayerWeekPoint | null>(
    (worst, week) => (!worst || week.change < worst.change ? week : worst),
    null,
  )

  return {
    startingRating,
    officialStart,
    officialRating,
    replayEnd,
    totalChange,
    peakRating,
    bestWeek,
    worstWeek,
    avgPointsFor: player.games ? player.pointsFor / player.games : 0,
    avgPointsAgainst: player.games ? player.pointsAgainst / player.games : 0,
    weeksPlayed: weeks.filter((week) => week.games > 0).length,
  }
}

function PlayerProfileDetail({
  player,
  rank,
  weeks,
}: {
  player: PlayerStanding
  rank: number
  weeks: PlayerWeekPoint[]
}) {
  const stats = useMemo(() => buildProfileStats(player, weeks), [player, weeks])
  const history = useMemo(() => [...weeks].reverse(), [weeks])

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
        </div>
      </div>

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
          <span>Point +/−</span>
          <strong>
            {player.pointsFor - player.pointsAgainst >= 0 ? '+' : ''}
            {player.pointsFor - player.pointsAgainst}
          </strong>
        </div>
        <div>
          <span>Weeks played</span>
          <strong>{stats.weeksPlayed}</strong>
        </div>
        <div>
          <span>Imported start</span>
          <strong>{formatRating(stats.officialStart)}</strong>
        </div>
        <div>
          <span>Since import</span>
          <strong
            className={
              stats.officialRating - stats.officialStart >= 0 ? 'positive' : 'negative'
            }
          >
            {stats.officialRating - stats.officialStart >= 0 ? '+' : ''}
            {roundRating(stats.officialRating - stats.officialStart).toFixed(3)}
          </strong>
        </div>
        <div>
          <span>From 3.0 replay</span>
          <strong>{formatRating(stats.replayEnd)}</strong>
        </div>
        <div>
          <span>Avg points</span>
          <strong>
            {stats.avgPointsFor.toFixed(1)} / {stats.avgPointsAgainst.toFixed(1)}
          </strong>
        </div>
        <div>
          <span>Best week</span>
          <strong className="positive">
            {stats.bestWeek ? `+${stats.bestWeek.change.toFixed(3)}` : '—'}
          </strong>
        </div>
        <div>
          <span>Worst week</span>
          <strong className="negative">
            {stats.worstWeek ? stats.worstWeek.change.toFixed(3) : '—'}
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

      <p className="players-chart-note">
        Graph replays all games from a 3.0 start. Leaderboard 4DR uses the imported starting
        rating ({formatRating(stats.officialStart)}) and only moves on new games saved here.
      </p>

      <RatingChart
        weeks={weeks}
        currentRating={stats.replayEnd}
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
                  <th>Week</th>
                  <th>Games</th>
                  <th>Record</th>
                  <th>Points</th>
                  <th>4DR +/-</th>
                </tr>
              </thead>
              <tbody>
                {history.map((week) => (
                  <tr key={week.key}>
                    <td>{week.label}</td>
                    <td>{week.games}</td>
                    <td>
                      {week.wins}-{week.losses}
                    </td>
                    <td>
                      {week.pointsFor}-{week.pointsAgainst}
                    </td>
                    <td className={week.change >= 0 ? 'positive' : 'negative'}>
                      {week.change >= 0 ? '+' : ''}
                      {week.change.toFixed(3)}
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

export function PlayersPanel({
  data,
  standings,
  rankByPlayerId,
}: {
  data: AppData
  standings: PlayerStanding[]
  rankByPlayerId: Map<string, number>
}) {
  const [search, setSearch] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    () => standings[0]?.id ?? null,
  )

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return standings
    return standings.filter((player) => player.name.toLowerCase().includes(query))
  }, [search, standings])

  const selectedPlayer = useMemo(
    () => standings.find((player) => player.id === selectedPlayerId) ?? null,
    [selectedPlayerId, standings],
  )

  const selectedWeeks = useMemo(
    () => (selectedPlayer ? buildPlayerRatingWeeks(selectedPlayer.id, data, 'fromDefault') : []),
    [selectedPlayer, data],
  )

  return (
    <div className="players-workspace">
      <section className="panel players-list-panel">
        <div className="panel-heading players-heading">
          <label className="search-control players-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search players..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search players"
            />
          </label>
        </div>
        <div className="players-list">
          {filteredPlayers.map((player) => {
            const rank = rankByPlayerId.get(player.id) ?? 0
            const isSelected = player.id === selectedPlayerId
            return (
              <button
                key={player.id}
                type="button"
                className={`players-list-item${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedPlayerId(player.id)}
              >
                <span
                  className={`players-list-rank rank-pos-${rank <= 3 ? rank : 'other'}`}
                  data-rank={rank}
                >
                  {rank}
                </span>
                <span className="player-avatar" aria-hidden="true">
                  {player.name.slice(0, 1)}
                </span>
                <span className="players-list-copy">
                  <strong>{player.name}</strong>
                  <small>
                    {formatRating(player.rating)} · {player.wins}-{player.losses} ·{' '}
                    {player.games} game{player.games === 1 ? '' : 's'}
                  </small>
                </span>
              </button>
            )
          })}
          {filteredPlayers.length === 0 ? (
            <p className="players-list-empty">
              {standings.length === 0
                ? 'No players yet.'
                : `No players match "${search.trim()}".`}
            </p>
          ) : null}
        </div>
      </section>

      {selectedPlayer ? (
        <PlayerProfileDetail
          player={selectedPlayer}
          rank={rankByPlayerId.get(selectedPlayer.id) ?? 0}
          weeks={selectedWeeks}
        />
      ) : (
        <aside className="panel players-profile-panel empty">
          <h2>Player overview</h2>
          <p>Select a player to see their statistics and rating history.</p>
        </aside>
      )}
    </div>
  )
}
