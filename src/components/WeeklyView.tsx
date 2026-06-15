import { memo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PlayerSearchAutocomplete } from './PlayerAutocomplete'
import { SortableHeader } from './SortableHeader'
import {
  formatGameRating,
  formatPercent,
  formatSignedPoints,
  movementClass,
} from '../lib/format'
import { roundRating } from '../lib/scoring'
import { formatRating } from '../lib/scoring'
import type {
  SortDirection,
  WeeklyPlayerGame,
  WeeklySortKey,
  WeeklyStanding,
} from '../lib/types'

type WeekOption = { key: string; label: string }

type WeeklyViewProps = {
  weekOptions: WeekOption[]
  activeWeek: string
  onWeekChange: (week: string) => void
  weeklySearch: string
  onWeeklySearchChange: (value: string) => void
  weeklySearchPlayers: { id: string; name: string }[]
  onSelectPlayer: (playerId: string) => void
  filteredWeeklyStandings: WeeklyStanding[]
  weeklyRankByPlayerId: Map<string, number>
  effectiveWeeklyPlayerId: string | null
  weeklySort: { key: WeeklySortKey; direction: SortDirection }
  onToggleWeeklySort: (key: WeeklySortKey) => void
  selectedWeeklyPlayerName: string
  selectedWeeklyComputedPlayer?: WeeklyStanding
  weeklyPlayerGames: WeeklyPlayerGame[]
}

export const WeeklyView = memo(WeeklyViewBase)

function WeeklyViewBase({
  weekOptions,
  activeWeek,
  onWeekChange,
  weeklySearch,
  onWeeklySearchChange,
  weeklySearchPlayers,
  onSelectPlayer,
  filteredWeeklyStandings,
  weeklyRankByPlayerId,
  effectiveWeeklyPlayerId,
  weeklySort,
  onToggleWeeklySort,
  selectedWeeklyPlayerName,
  selectedWeeklyComputedPlayer,
  weeklyPlayerGames,
}: WeeklyViewProps) {
  const weeklyDetailRef = useRef<HTMLElement | null>(null)

  function selectWeeklyPlayer(playerId: string) {
    onSelectPlayer(playerId)
    if (!window.matchMedia('(max-width: 680px)').matches) return
    window.requestAnimationFrame(() => {
      weeklyDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="weekly-workspace">
      <div className="weekly-main-column">
      <section className="panel weekly-panel weekly-controls-panel">
        <div className="panel-heading weekly-heading">
          <PlayerSearchAutocomplete
            players={weeklySearchPlayers}
            value={weeklySearch}
            onChange={onWeeklySearchChange}
            onSelect={selectWeeklyPlayer}
            placeholder="Search players..."
            ariaLabel="Search weekly players"
            className="weekly-search"
          />
          <select
            className="week-select"
            value={activeWeek}
            onChange={(event) => onWeekChange(event.target.value)}
            aria-label="Select week"
          >
            {weekOptions.map((week) => (
              <option key={week.key} value={week.key}>
                {week.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel weekly-panel weekly-table-panel">
        <div className="table-wrap">
          <table className="weekly-table">
            <thead>
              <tr>
                <SortableHeader
                  label="Rank"
                  sortKey="rank"
                  activeSort={weeklySort}
                  onSort={onToggleWeeklySort}
                />
                <SortableHeader
                  label="Player"
                  sortKey="player"
                  activeSort={weeklySort}
                  onSort={onToggleWeeklySort}
                />
                <SortableHeader
                  label="4DR"
                  sortKey="rating"
                  activeSort={weeklySort}
                  onSort={onToggleWeeklySort}
                  title="Current doubles rating"
                />
                <SortableHeader
                  label="Weekly +/-"
                  sortKey="weeklyChange"
                  activeSort={weeklySort}
                  onSort={onToggleWeeklySort}
                  title="4DR change this week"
                />
                <SortableHeader
                  label="Diff"
                  sortKey="recordDiff"
                  activeSort={weeklySort}
                  onSort={onToggleWeeklySort}
                  title="Wins minus losses this week"
                />
              </tr>
            </thead>
            <tbody>
              {filteredWeeklyStandings.map((player, index) => {
                const pointDifference = player.pointsFor - player.pointsAgainst
                const recordDifference = player.wins - player.losses
                return (
                  <tr
                    key={player.playerId}
                    className={
                      effectiveWeeklyPlayerId === player.playerId ? 'selected-row' : ''
                    }
                    tabIndex={0}
                    onClick={() => selectWeeklyPlayer(player.playerId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        selectWeeklyPlayer(player.playerId)
                      }
                    }}
                  >
                    <td className="rank-cell">
                      {weeklyRankByPlayerId.get(player.playerId) ?? index + 1}
                    </td>
                    <td className="weekly-player-cell">
                      <strong>{player.name}</strong>
                      <span>
                        {player.games} game{player.games === 1 ? '' : 's'} | point{' '}
                        {pointDifference >= 0 ? '+' : ''}
                        {pointDifference}
                      </span>
                    </td>
                    <td className="rating-cell">{formatRating(player.rating)}</td>
                    <td data-label="Weekly +/-">
                      <span className={movementClass(player.change)}>
                        {player.change >= 0 ? '+' : ''}
                        {player.change.toFixed(3)}
                      </span>
                    </td>
                    <td data-label="Diff">
                      <span className={movementClass(recordDifference)}>
                        {recordDifference >= 0 ? '+' : ''}
                        {recordDifference}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filteredWeeklyStandings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-table">
                    {weekOptions.length === 0
                      ? 'No games recorded yet.'
                      : weeklySearch.trim()
                        ? `No players match "${weeklySearch.trim()}".`
                        : 'No games found for this week.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      </div>

      <WeeklyPlayerDetail
        detailRef={weeklyDetailRef}
        games={weeklyPlayerGames}
        playerName={selectedWeeklyPlayerName}
        computedPlayer={selectedWeeklyComputedPlayer}
      />
    </div>
  )
}

function WeeklyPlayerDetail({
  detailRef,
  games,
  playerName,
  computedPlayer,
}: {
  detailRef: Ref<HTMLElement>
  games: WeeklyPlayerGame[]
  playerName: string
  computedPlayer?: WeeklyStanding
}) {
  const wins = games.filter((game) => game.result === 'Win').length
  const losses = games.length - wins
  const pointsFor = games.reduce(
    (total, game) => total + (game.selectedTeam === 'A' ? game.scoreA : game.scoreB),
    0,
  )
  const pointsAgainst = games.reduce(
    (total, game) => total + (game.selectedTeam === 'A' ? game.scoreB : game.scoreA),
    0,
  )
  const totalChange =
    computedPlayer?.change ?? roundRating(games.reduce((total, game) => total + game.ratingChange, 0))

  if (!playerName) {
    return (
      <aside ref={detailRef} className="panel weekly-detail-panel empty-weekly-detail">
        <h2>Weekly player overview</h2>
        <p>Select a player in the weekly leaderboard to see their games.</p>
      </aside>
    )
  }

  return (
    <aside ref={detailRef} className="panel weekly-detail-panel">
      <div className="weekly-detail-head">
        <div>
          <span className="eyebrow">Weekly player overview</span>
          <h2>{playerName}</h2>
          <p>
            {games.length} game{games.length === 1 ? '' : 's'} this week
          </p>
        </div>
        {computedPlayer ? (
          <strong>
            {computedPlayer.change >= 0 ? '+' : ''}
            {computedPlayer.change.toFixed(3)}
          </strong>
        ) : null}
      </div>

      <div className="weekly-detail-metrics">
        <div>
          <span>Record</span>
          <strong>
            {wins}-{losses}
          </strong>
        </div>
        <div>
          <span>Points</span>
          <strong>
            {pointsFor}-{pointsAgainst}
          </strong>
        </div>
        <div>
          <span>4DR move</span>
          <strong className={totalChange >= 0 ? 'positive' : 'negative'}>
            {totalChange >= 0 ? '+' : ''}
            {totalChange.toFixed(3)}
          </strong>
        </div>
      </div>

      <div className="weekly-games-list">
        {games.map((game) => (
          <WeeklyGameStatsCard game={game} key={game.id} />
        ))}
        {games.length === 0 ? (
          <div className="empty-table">
            No game details were found for this player in the selected week.
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function WeeklyGameStatsCard({ game }: { game: WeeklyPlayerGame }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const teamAIsWinner = game.winner === 'A'
  const winnerTeam = teamAIsWinner ? game.teamA : game.teamB
  const loserTeam = teamAIsWinner ? game.teamB : game.teamA
  const winnerAverage = teamAIsWinner ? game.teamAStart : game.teamBStart
  const loserAverage = teamAIsWinner ? game.teamBStart : game.teamAStart
  const winnerProbability = teamAIsWinner
    ? game.teamAWinProbability
    : 1 - game.teamAWinProbability
  const baseShare = 1 - winnerProbability
  const marginBonus = Math.abs(game.scoreA - game.scoreB) * 0.001
  const loserPointBonus = Math.min(game.scoreA, game.scoreB) * 0.001
  const winnerDelta = teamAIsWinner ? game.teamADelta : game.teamBDelta
  const loserDelta = teamAIsWinner ? game.teamBDelta : game.teamADelta
  const scoreLabel = `${game.scoreA}-${game.scoreB}`

  return (
    <article className="weekly-game-card">
      <div className="game-card-top">
        <div>
          <span className="eyebrow">Game #{game.gameNumber}</span>
          <h3>{scoreLabel}</h3>
        </div>
        <span className={game.result === 'Win' ? 'result-win' : 'result-loss'}>{game.result}</span>
      </div>

      <div className="matchup-board" aria-label={`Game ${game.gameNumber} matchup`}>
        <GameTeam
          label="Team A"
          players={game.teamA}
          score={game.scoreA}
          isWinner={teamAIsWinner}
          selectedPlayerId={game.selectedPlayerId}
        />
        <div className="matchup-divider">vs</div>
        <GameTeam
          label="Team B"
          players={game.teamB}
          score={game.scoreB}
          isWinner={!teamAIsWinner}
          selectedPlayerId={game.selectedPlayerId}
        />
      </div>

      <button
        type="button"
        className="weekly-details-toggle"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
      >
        {detailsOpen ? 'Hide rating details' : 'Show rating details'}
        {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {detailsOpen ? (
        <>
          <div className="game-stat-grid">
            <div>
              <span>Winners avg 4DR</span>
              <strong>{formatGameRating(winnerAverage)}</strong>
            </div>
            <div>
              <span>Losers avg 4DR</span>
              <strong>{formatGameRating(loserAverage)}</strong>
            </div>
          </div>

          <div className="probability-block">
            <div className="probability-head">
              <span>Win probability</span>
              <strong>{formatPercent(winnerProbability)}</strong>
            </div>
            <div className="probability-track">
              <span style={{ width: formatPercent(winnerProbability) }} />
            </div>
            <p>
              {formatPercent(baseShare)} of 0.100 = {game.baseDelta.toFixed(3)} 4DR points
            </p>
          </div>

          <div className="table-wrap">
            <table className="points-breakdown">
              <thead>
                <tr>
                  <th />
                  <th>4DR</th>
                  <th>Score</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Winners</th>
                  <td className="positive">{formatSignedPoints(game.baseDelta)}</td>
                  <td className="positive">{formatSignedPoints(marginBonus)}</td>
                  <td className="positive">{formatSignedPoints(winnerDelta)}</td>
                </tr>
                <tr>
                  <th>Losers</th>
                  <td className="negative">{formatSignedPoints(-game.baseDelta)}</td>
                  <td className="positive">{formatSignedPoints(loserPointBonus)}</td>
                  <td className={loserDelta >= 0 ? 'positive' : 'negative'}>
                    {formatSignedPoints(loserDelta)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="player-breakdown">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Start</th>
                  <th>+/-</th>
                  <th>Finish</th>
                </tr>
              </thead>
              <tbody>
                {[...winnerTeam, ...loserTeam].map((player) => (
                  <tr
                    className={player.id === game.selectedPlayerId ? 'selected-player' : ''}
                    key={`${game.id}-${player.id}`}
                  >
                    <th
                      className={
                        winnerTeam.some((winner) => winner.id === player.id) ? 'positive' : 'negative'
                      }
                    >
                      {player.name}
                    </th>
                    <td>{formatGameRating(player.start)}</td>
                    <td className={player.change >= 0 ? 'positive' : 'negative'}>
                      {formatSignedPoints(player.change)}
                    </td>
                    <td>{formatGameRating(player.finish)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </article>
  )
}

function GameTeam({
  label,
  players,
  score,
  isWinner,
  selectedPlayerId,
}: {
  label: string
  players: WeeklyPlayerGame['teamA']
  score: number
  isWinner: boolean
  selectedPlayerId: string
}) {
  return (
    <div className={`game-team ${isWinner ? 'winner' : 'loser'}`}>
      <div>
        <span>{label}</span>
        <strong>{score}</strong>
      </div>
      {players.map((player) => (
        <p
          className={player.id === selectedPlayerId ? 'selected-player-name' : ''}
          key={player.id}
        >
          {player.name}
        </p>
      ))}
    </div>
  )
}
