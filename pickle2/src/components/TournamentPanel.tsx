import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Flag,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { AdminField, FieldInput, FieldInputWrap } from './AdminField'
import { PlayerSearchAdd } from './PlayerSearchAdd'
import { formatPlayedOnDate, formatResultsLabel, makeId } from '../lib/data'
import { loadRemoteTournament, saveRemoteTournament } from '../lib/tournamentStorage'
import {
  buildNextRound,
  createTournament,
  isRoundComplete,
  parseGameScores,
  rankCourtPlayers,
  type TournamentRound,
  type TournamentState,
} from '../lib/tournament'
import type { Match, PlayerStanding } from '../lib/types'

const DEFAULT_TIMER_MINUTES = 12
const MIN_TIMER_MINUTES = 1
const MAX_TIMER_MINUTES = 60

function durationInputToSeconds(value: string) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return DEFAULT_TIMER_MINUTES * 60
  return Math.round(Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, minutes))) * 60
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function RoundTab({
  round,
  isActive,
  isSaved,
  onSelect,
}: {
  round: number
  isActive: boolean
  isSaved: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`tournament-round-tab${isActive ? ' active' : ''}${isSaved ? ' saved' : ''}`}
      onClick={onSelect}
      aria-selected={isActive}
      role="tab"
    >
      Round {round}
      {isSaved ? <Check size={14} aria-hidden /> : null}
    </button>
  )
}

function TournamentTimer() {
  const defaultSeconds = DEFAULT_TIMER_MINUTES * 60
  const [durationInput, setDurationInput] = useState(String(DEFAULT_TIMER_MINUTES))
  const [remainingSeconds, setRemainingSeconds] = useState(defaultSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [endsAt, setEndsAt] = useState<number | null>(null)

  useEffect(() => {
    if (!isRunning || !endsAt) return
    const tick = () => {
      const nextRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setRemainingSeconds(nextRemaining)
      if (nextRemaining === 0) {
        setIsRunning(false)
        setEndsAt(null)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 250)
    return () => window.clearInterval(intervalId)
  }, [endsAt, isRunning])

  function updateDuration(value: string) {
    if (hasStarted) return
    setDurationInput(value)
    if (value.trim() === '') return
    setRemainingSeconds(durationInputToSeconds(value))
  }

  function commitDuration() {
    const seconds = durationInputToSeconds(durationInput)
    setDurationInput(String(seconds / 60))
    if (!hasStarted) setRemainingSeconds(seconds)
  }

  function startTimer() {
    if (remainingSeconds <= 0) return
    setHasStarted(true)
    setIsRunning(true)
    setEndsAt(Date.now() + remainingSeconds * 1000)
  }

  function pauseTimer() {
    if (endsAt) {
      setRemainingSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }
    setIsRunning(false)
    setEndsAt(null)
  }

  function resetTimer() {
    const seconds = durationInputToSeconds(durationInput)
    setIsRunning(false)
    setHasStarted(false)
    setEndsAt(null)
    setRemainingSeconds(seconds)
  }

  const isTimeUp = hasStarted && remainingSeconds === 0

  return (
    <section className={`tournament-timer${isRunning ? ' running' : ''}${isTimeUp ? ' done' : ''}`}>
      <div className="tournament-timer-display">
        <span className="tournament-timer-icon" aria-hidden>
          <Clock size={18} />
        </span>
        <div>
          <span className="tournament-timer-label">Round timer</span>
          <strong>{formatTimer(remainingSeconds)}</strong>
        </div>
      </div>

      <div className="tournament-timer-controls">
        <AdminField label="Minutes">
          <FieldInput
            type="number"
            min={MIN_TIMER_MINUTES}
            max={MAX_TIMER_MINUTES}
            step="1"
            value={durationInput}
            onChange={(event) => updateDuration(event.target.value)}
            onBlur={commitDuration}
            disabled={hasStarted}
            aria-label="Timer duration in minutes"
          />
        </AdminField>
        <button
          type="button"
          className="primary-button tournament-timer-button"
          onClick={isRunning ? pauseTimer : startTimer}
          disabled={remainingSeconds <= 0}
        >
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button type="button" className="ghost-button tournament-timer-button" onClick={resetTimer}>
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
    </section>
  )
}

function TournamentRoundView({
  round,
  readOnly,
  nameOf,
  onUpdateScore,
}: {
  round: TournamentRound
  readOnly: boolean
  nameOf: (playerId: string) => string
  onUpdateScore: (
    courtIndex: number,
    gameIndex: number,
    field: 'scoreA' | 'scoreB',
    value: string,
  ) => void
}) {
  const gameCount = Math.max(...round.courts.map((court) => court.games.length))
  const roundComplete = isRoundComplete(round)

  return (
    <>
      <div className="tournament-game-list">
        {Array.from({ length: gameCount }, (_, gameIndex) => {
          const sitOutIds = round.courts[0]?.games[gameIndex]?.sitOutIds ?? []
          const scoredCount = round.courts.filter((court) => parseGameScores(court.games[gameIndex])).length
          return (
            <section className="tournament-game-block" key={gameIndex}>
              <header className="tournament-game-head">
                <div>
                  <span className="tournament-game-kicker">Game {gameIndex + 1}</span>
                  {sitOutIds.length > 0 ? (
                    <p>
                      Sitting: <strong>{sitOutIds.map(nameOf).join(', ')}</strong>
                    </p>
                  ) : (
                    <p>Everyone plays this game.</p>
                  )}
                </div>
                <span className="tournament-game-progress">
                  {scoredCount}/{round.courts.length} scored
                </span>
              </header>

              <div className="tournament-game-courts">
                {round.courts.map((court, courtIndex) => {
                  const game = court.games[gameIndex]
                  if (!game) return null
                  return (
                    <article className="tournament-match" key={game.id}>
                      <div className="tournament-match-top">
                        <span className="tournament-court-badge">Court {court.court}</span>
                        {parseGameScores(game) ? <span className="tournament-score-status">Done</span> : null}
                      </div>
                      <div className="tournament-match-body">
                        <div className="tournament-match-team home">
                          <span>{nameOf(game.teamA[0])}</span>
                          <span>{nameOf(game.teamA[1])}</span>
                        </div>
                        <div className="tournament-match-scores">
                          <FieldInputWrap className="tournament-score-input">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              placeholder="–"
                              readOnly={readOnly}
                              aria-label={`Court ${court.court} game ${gameIndex + 1} first team score`}
                              value={game.scoreA}
                              onChange={(event) =>
                                onUpdateScore(courtIndex, gameIndex, 'scoreA', event.target.value)
                              }
                            />
                          </FieldInputWrap>
                          <span className="tournament-score-vs">vs</span>
                          <FieldInputWrap className="tournament-score-input">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              placeholder="–"
                              readOnly={readOnly}
                              aria-label={`Court ${court.court} game ${gameIndex + 1} second team score`}
                              value={game.scoreB}
                              onChange={(event) =>
                                onUpdateScore(courtIndex, gameIndex, 'scoreB', event.target.value)
                              }
                            />
                          </FieldInputWrap>
                        </div>
                        <div className="tournament-match-team away">
                          <span>{nameOf(game.teamB[0])}</span>
                          <span>{nameOf(game.teamB[1])}</span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {roundComplete ? (
        <section className="tournament-results-grid" aria-label="Round results">
          {round.courts.map((court) => {
            const ranking = rankCourtPlayers(court)
            return (
              <article className="tournament-court-results" key={court.court}>
                <span className="tournament-results-label">Court {court.court} finish</span>
                <div className="tournament-court-standings">
                  {ranking.map((result, index) => (
                    <span
                      key={result.playerId}
                      className={index < 2 ? 'tournament-rank moving-up' : 'tournament-rank moving-down'}
                    >
                      {index + 1}. {nameOf(result.playerId)} · {result.wins}W ·{' '}
                      {result.pointDiff >= 0 ? '+' : ''}
                      {result.pointDiff}
                    </span>
                  ))}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}
    </>
  )
}

export function TournamentPanel({
  standings,
  saveRoundMatches,
}: {
  standings: PlayerStanding[]
  saveRoundMatches: (matches: Match[]) => Promise<boolean>
}) {
  const [tournament, setTournament] = useState<TournamentState | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeRoundIndex, setActiveRoundIndex] = useState(0)
  const [tournamentLoaded, setTournamentLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadRemoteTournament().then((stored) => {
      if (cancelled) return
      if (stored) {
        setTournament(stored)
        setActiveRoundIndex(stored.rounds.length - 1)
      }
      setTournamentLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!tournamentLoaded) return
    void saveRemoteTournament(tournament)
  }, [tournament, tournamentLoaded])

  const playerNameById = useMemo(
    () => new Map(standings.map((player) => [player.id, player.name])),
    [standings],
  )
  const nameOf = (playerId: string) => playerNameById.get(playerId) ?? 'Unknown'

  const seededSelection = useMemo(
    () => standings.filter((player) => selectedIds.includes(player.id)).map((player) => player.id),
    [selectedIds, standings],
  )

  function addPlayer(playerId: string) {
    setFormError('')
    setSelectedIds((current) => (current.includes(playerId) ? current : [...current, playerId]))
  }

  function removePlayer(playerId: string) {
    setSelectedIds((current) => current.filter((id) => id !== playerId))
  }

  function startTournament() {
    if (seededSelection.length < 4) {
      setFormError('Pick at least 4 players to start a tournament.')
      return
    }
    setFormError('')
    setActiveRoundIndex(0)
    setTournamentLoaded(true)
    setTournament(createTournament(seededSelection, playedOn))
  }

  function updateScore(
    roundIndex: number,
    courtIndex: number,
    gameIndex: number,
    field: 'scoreA' | 'scoreB',
    value: string,
  ) {
    setFormError('')
    setTournament((current) => {
      if (!current || roundIndex !== current.rounds.length - 1) return current
      const round = current.rounds[roundIndex]
      const courts = round.courts.map((court, cIndex) =>
        cIndex === courtIndex
          ? {
              ...court,
              games: court.games.map((game, gIndex) =>
                gIndex === gameIndex ? { ...game, [field]: value } : game,
              ),
            }
          : court,
      )
      return {
        ...current,
        rounds: current.rounds.map((entry, index) =>
          index === roundIndex ? { ...round, courts } : entry,
        ),
      }
    })
  }

  async function completeRound(finish: boolean) {
    if (!tournament) return
    const round = tournament.rounds[tournament.rounds.length - 1]
    if (!isRoundComplete(round)) {
      setFormError('Enter a score for every game first (winner and loser scores must differ).')
      return
    }

    const matches: Match[] = round.courts.flatMap((court) =>
      court.games.map((game) => {
        const scores = parseGameScores(game)!
        const winnerIsA = scores.scoreA > scores.scoreB
        return {
          id: makeId('m'),
          week: formatResultsLabel(tournament.playedOn),
          playedOn: tournament.playedOn,
          teamA: winnerIsA ? game.teamA : game.teamB,
          teamB: winnerIsA ? game.teamB : game.teamA,
          scoreA: winnerIsA ? scores.scoreA : scores.scoreB,
          scoreB: winnerIsA ? scores.scoreB : scores.scoreA,
        }
      }),
    )

    setSaving(true)
    const saved = await saveRoundMatches(matches)
    setSaving(false)
    if (!saved) return

    if (finish) {
      setTournament(null)
      setSelectedIds([])
      setActiveRoundIndex(0)
    } else {
      setActiveRoundIndex(tournament.rounds.length)
      setTournament(buildNextRound(tournament))
    }
  }

  function cancelTournament() {
    if (!window.confirm('End this tournament? Unsaved scores in the current round will be lost.')) {
      return
    }
    setTournament(null)
    setSelectedIds([])
    setActiveRoundIndex(0)
    setFormError('')
  }

  if (!tournament) {
    const courtCount = Math.floor(seededSelection.length / 4)
    const sitOutCount = seededSelection.length % 4

    return (
      <section className="panel tournament-panel tournament-setup">
        <div className="tournament-hero">
          <div className="tournament-hero-copy">
            <span className="tournament-hero-icon" aria-hidden>
              <Trophy size={22} />
            </span>
            <div>
              <h2>Tournament setup</h2>
            </div>
          </div>
        </div>

        <div className="tournament-setup-grid">
          <AdminField label="Date">
            <FieldInput
              type="date"
              value={playedOn}
              onChange={(event) => setPlayedOn(event.target.value)}
            />
          </AdminField>
          <div className="tournament-stat-pills">
            <span className="tournament-stat-pill">
              <Users size={15} aria-hidden />
              {seededSelection.length} players
            </span>
            <span className="tournament-stat-pill">
              <Trophy size={15} aria-hidden />
              {courtCount} court{courtCount === 1 ? '' : 's'}
            </span>
            {sitOutCount > 0 ? (
              <span className="tournament-stat-pill muted">
                {sitOutCount} random sit-out{sitOutCount === 1 ? '' : 's'} per game
              </span>
            ) : null}
          </div>
        </div>

        <PlayerSearchAdd
          players={standings}
          selectedIds={selectedIds}
          onAdd={addPlayer}
          onRemove={removePlayer}
        />

        {formError ? <p className="form-error">{formError}</p> : null}
        <div className="tournament-actions">
          <button
            type="button"
            className="primary-button"
            onClick={startTournament}
            disabled={seededSelection.length < 4}
          >
            <Trophy size={17} />
            Generate
          </button>
        </div>
      </section>
    )
  }

  const latestRoundIndex = tournament.rounds.length - 1
  const activeRound = tournament.rounds[activeRoundIndex]
  const isCurrentRound = activeRoundIndex === latestRoundIndex
  const roundDone = isRoundComplete(activeRound)
  const totalGames = activeRound.courts.reduce((total, court) => total + court.games.length, 0)
  const completedGames = activeRound.courts.reduce(
    (total, court) => total + court.games.filter((game) => parseGameScores(game)).length,
    0,
  )

  return (
    <section className="panel tournament-panel tournament-active">
      <div className="tournament-toolbar">
        <div className="tournament-toolbar-meta">
          <span className="tournament-meta-chip">
            <CalendarDays size={15} aria-hidden />
            {formatPlayedOnDate(tournament.playedOn)}
          </span>
          <span className="tournament-meta-chip">
            <Users size={15} aria-hidden />
            {tournament.playerIds.length} players
          </span>
          <span className="tournament-meta-chip">
            <Check size={15} aria-hidden />
            {completedGames}/{totalGames} scores
          </span>
        </div>
        <button type="button" className="ghost-button tournament-cancel" onClick={cancelTournament}>
          <X size={16} />
          End tournament
        </button>
      </div>

      <TournamentTimer />

      <div className="tournament-round-tabs" role="tablist" aria-label="Tournament rounds">
        {tournament.rounds.map((round, index) => (
          <RoundTab
            key={round.round}
            round={round.round}
            isActive={index === activeRoundIndex}
            isSaved={index < latestRoundIndex}
            onSelect={() => setActiveRoundIndex(index)}
          />
        ))}
      </div>

      {!isCurrentRound ? (
        <p className="tournament-round-hint saved">Round {activeRound.round} saved — view only.</p>
      ) : null}

      <TournamentRoundView
        round={activeRound}
        readOnly={!isCurrentRound}
        nameOf={nameOf}
        onUpdateScore={(courtIndex, gameIndex, field, value) =>
          updateScore(activeRoundIndex, courtIndex, gameIndex, field, value)
        }
      />

      {isCurrentRound ? (
        <>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="tournament-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => completeRound(false)}
              disabled={!roundDone || saving}
            >
              <ArrowRight size={17} />
              {saving ? 'Saving…' : 'Save round & next'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => completeRound(true)}
              disabled={!roundDone || saving}
            >
              <Flag size={16} />
              Save & finish
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
