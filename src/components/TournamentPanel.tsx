import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { AdminField } from './AdminField'
import { DatePicker } from './DatePicker'
import { PlayerPickerDialog } from './PlayerPickerDialog'
import { ScoreInput } from './ScoreInput'
import { type ThemedSelectOption } from './ThemedSelect'
import { PlayerSlotSelect } from './PlayerSlotSelect'
import { formatPlayedOnDate, formatResultsLabel, makeId } from '../lib/data'
import { loadRemoteTournament, saveRemoteTournament } from '../lib/tournamentStorage'
import {
  buildNextRound,
  courtMovement,
  createTournament,
  gameHasAllPlayers,
  isRoundComplete,
  parseGameScores,
  rankCourtPlayers,
  rebuildRoundsAfter,
  type CourtMovement,
  type TournamentGame,
  type TournamentRound,
  type TournamentState,
} from '../lib/tournament'
import type { Match, PlayerStanding } from '../lib/types'

const DEFAULT_TIMER_MINUTES = 12
const MIN_TIMER_MINUTES = 1
const MAX_TIMER_MINUTES = 60
const MOVE_CLASS: Record<CourtMovement, string> = {
  up: 'moving-up',
  down: 'moving-down',
  stays: 'staying',
}

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
  isComplete,
  onSelect,
}: {
  round: number
  isActive: boolean
  isSaved: boolean
  isComplete: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`tournament-round-tab${isActive ? ' active' : ''}${isSaved ? ' saved' : ''}${
        isComplete ? ' complete' : ''
      }`}
      onClick={onSelect}
      aria-selected={isActive}
      role="tab"
    >
      Round {round}
      {isComplete ? <Check size={14} aria-hidden /> : null}
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

  function stepMinutes(delta: number) {
    if (hasStarted) return
    const current = Math.round(durationInputToSeconds(durationInput) / 60)
    const next = Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, current + delta))
    setDurationInput(String(next))
    setRemainingSeconds(next * 60)
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
  const totalSeconds = Math.max(1, durationInputToSeconds(durationInput))
  const progress = Math.min(1, Math.max(0, remainingSeconds / totalSeconds))

  return (
    <section
      className={`tournament-timer${isRunning ? ' running' : ''}${isTimeUp ? ' done' : ''}`}
      style={{ ['--timer-progress' as string]: progress }}
    >
      <div className="tournament-timer-display">
        <span className="tournament-timer-icon" aria-hidden>
          <Clock size={20} />
        </span>
        <div className="tournament-timer-readout">
          <span className="tournament-timer-label">Round timer</span>
          <strong>{formatTimer(remainingSeconds)}</strong>
          <span className="tournament-timer-status">
            {isTimeUp ? "Time's up" : isRunning ? 'Counting down' : hasStarted ? 'Paused' : 'Ready'}
          </span>
        </div>
      </div>

      <div className="tournament-timer-controls">
        <div className="tournament-timer-minutes">
          <span className="tournament-timer-minutes-label">Minutes</span>
          <div className="tournament-timer-stepper">
            <button
              type="button"
              className="tournament-timer-step"
              onClick={() => stepMinutes(-1)}
              disabled={hasStarted || Math.round(totalSeconds / 60) <= MIN_TIMER_MINUTES}
              aria-label="Decrease minutes"
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              className="tournament-timer-minutes-input"
              min={MIN_TIMER_MINUTES}
              max={MAX_TIMER_MINUTES}
              step="1"
              value={durationInput}
              onChange={(event) => updateDuration(event.target.value)}
              onBlur={commitDuration}
              disabled={hasStarted}
              aria-label="Timer duration in minutes"
            />
            <button
              type="button"
              className="tournament-timer-step"
              onClick={() => stepMinutes(1)}
              disabled={hasStarted || Math.round(totalSeconds / 60) >= MAX_TIMER_MINUTES}
              aria-label="Increase minutes"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="tournament-timer-actions">
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
      </div>

      <span className="tournament-timer-track" aria-hidden>
        <span className="tournament-timer-fill" />
      </span>
    </section>
  )
}

// The set of players on a court, in order of first appearance across its games.
function courtRosterFromGames(games: TournamentGame[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  games.forEach((game) => {
    ;[...game.teamA, ...game.teamB].forEach((id) => {
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    })
  })
  return ids
}

function PlayerSlot({
  playerId,
  editable,
  nameOf,
  options,
  onChange,
}: {
  playerId: string
  editable: boolean
  nameOf: (playerId: string) => string
  options: ThemedSelectOption[]
  onChange: (playerId: string) => void
}) {
  if (!editable) {
    return (
      <span className={playerId ? undefined : 'empty'}>
        {playerId ? nameOf(playerId) : 'Missing player'}
      </span>
    )
  }
  return (
    <PlayerSlotSelect
      className={playerId ? '' : 'empty'}
      value={playerId}
      options={options}
      onChange={onChange}
      placeholder="Missing player"
    />
  )
}

function TournamentRoundView({
  round,
  readOnly,
  editPlayers,
  nameOf,
  seedOrderIds,
  playerOptions,
  onUpdateScore,
  onUpdatePlayer,
  onToggleSkipGame,
}: {
  round: TournamentRound
  readOnly: boolean
  editPlayers: boolean
  nameOf: (playerId: string) => string
  seedOrderIds: string[]
  playerOptions: ThemedSelectOption[]
  onUpdateScore: (
    courtIndex: number,
    gameIndex: number,
    field: 'scoreA' | 'scoreB',
    value: string,
  ) => void
  onUpdatePlayer: (
    courtIndex: number,
    gameIndex: number,
    team: 'teamA' | 'teamB',
    slot: 0 | 1,
    playerId: string,
  ) => void
  onToggleSkipGame: (gameIndex: number) => void
}) {
  const gameCount = Math.max(...round.courts.map((court) => court.games.length))
  const roundComplete = isRoundComplete(round)

  return (
    <>
      <div className="tournament-game-list">
        {Array.from({ length: gameCount }, (_, gameIndex) => {
          const sitOutIds = round.courts[0]?.games[gameIndex]?.sitOutIds ?? []
          const skipped = round.courts[0]?.games[gameIndex]?.skipped ?? false
          const scoredCount = round.courts.filter((court) => parseGameScores(court.games[gameIndex])).length
          return (
            <section className={`tournament-game-block${skipped ? ' skipped' : ''}`} key={gameIndex}>
              <header className="tournament-game-head">
                <div>
                  <span className="tournament-game-kicker">Game {gameIndex + 1}</span>
                  {skipped ? (
                    <p>Skipped — not enough time.</p>
                  ) : sitOutIds.length > 0 ? (
                    <p>
                      Sitting: <strong>{sitOutIds.map(nameOf).join(', ')}</strong>
                    </p>
                  ) : (
                    <p>Everyone plays this game.</p>
                  )}
                </div>
                <div className="tournament-game-head-end">
                  <span className="tournament-game-progress">
                    {skipped ? 'Skipped' : `${scoredCount}/${round.courts.length} scored`}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="tournament-game-remove"
                      onClick={() => onToggleSkipGame(gameIndex)}
                      aria-label={skipped ? `Restore game ${gameIndex + 1}` : `Skip game ${gameIndex + 1}`}
                      title={skipped ? 'Restore this game' : 'Grey out this game (not enough time)'}
                    >
                      {skipped ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="tournament-game-courts">
                {round.courts.map((court, courtIndex) => {
                  const game = court.games[gameIndex]
                  if (!game) return null
                  return (
                    <article
                      className={`tournament-match${editPlayers ? ' editing-lineups' : ''}`}
                      key={game.id}
                    >
                      <div className="tournament-match-top">
                        <span className="tournament-court-badge">Court {court.court}</span>
                        {parseGameScores(game) ? <span className="tournament-score-status">Done</span> : null}
                      </div>
                      <div className="tournament-match-body pickleball-court">
                        <div className="tournament-match-team court-team court-team-top">
                          <PlayerSlot
                            playerId={game.teamA[0]}
                            editable={editPlayers}
                            nameOf={nameOf}
                            options={playerOptions}
                            onChange={(value) => onUpdatePlayer(courtIndex, gameIndex, 'teamA', 0, value)}
                          />
                          <PlayerSlot
                            playerId={game.teamA[1]}
                            editable={editPlayers}
                            nameOf={nameOf}
                            options={playerOptions}
                            onChange={(value) => onUpdatePlayer(courtIndex, gameIndex, 'teamA', 1, value)}
                          />
                        </div>
                        <div className="court-net-zone" aria-label="Scores">
                          <ScoreInput
                            className="tournament-score-input court-score court-score-top"
                            readOnly={readOnly}
                            ariaLabel={`Court ${court.court} game ${gameIndex + 1} top pair score`}
                            value={game.scoreA}
                            onChange={(value) =>
                              onUpdateScore(courtIndex, gameIndex, 'scoreA', value)
                            }
                          />
                          <span className="court-net" aria-hidden>
                            Net
                          </span>
                          <ScoreInput
                            className="tournament-score-input court-score court-score-bottom"
                            readOnly={readOnly}
                            ariaLabel={`Court ${court.court} game ${gameIndex + 1} bottom pair score`}
                            value={game.scoreB}
                            onChange={(value) =>
                              onUpdateScore(courtIndex, gameIndex, 'scoreB', value)
                            }
                          />
                        </div>
                        <div className="tournament-match-team court-team court-team-bottom">
                          <PlayerSlot
                            playerId={game.teamB[0]}
                            editable={editPlayers}
                            nameOf={nameOf}
                            options={playerOptions}
                            onChange={(value) => onUpdatePlayer(courtIndex, gameIndex, 'teamB', 0, value)}
                          />
                          <PlayerSlot
                            playerId={game.teamB[1]}
                            editable={editPlayers}
                            nameOf={nameOf}
                            options={playerOptions}
                            onChange={(value) => onUpdatePlayer(courtIndex, gameIndex, 'teamB', 1, value)}
                          />
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
            const courtCount = round.courts.length
            const ranking = rankCourtPlayers(court, seedOrderIds)
            return (
              <article className="tournament-court-results" key={court.court}>
                <span className="tournament-results-label">Court {court.court} finish</span>
                <div className="tournament-court-standings">
                  {ranking.map((result, index) => {
                    const move = courtMovement(index, court.court, courtCount)
                    const moveLabel =
                      move === 'up'
                        ? `↑ Court ${court.court - 1}`
                        : move === 'down'
                          ? `↓ Court ${court.court + 1}`
                          : '· Stays'
                    return (
                      <span
                        key={result.playerId}
                        className={`tournament-rank ${MOVE_CLASS[move]}`}
                      >
                        {index + 1}. {nameOf(result.playerId)} · {result.wins}W ·{' '}
                        {result.pointDiff >= 0 ? '+' : ''}
                        {result.pointDiff}
                        <span className="tournament-rank-move">{moveLabel}</span>
                      </span>
                    )
                  })}
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
  onFinished,
}: {
  standings: PlayerStanding[]
  saveRoundMatches: (matches: Match[]) => Promise<boolean>
  onFinished?: () => void
}) {
  const [tournament, setTournament] = useState<TournamentState | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeRoundIndex, setActiveRoundIndex] = useState(0)
  const [tournamentLoaded, setTournamentLoaded] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [editLineups, setEditLineups] = useState(false)

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
    // Debounce so rapid score edits don't fire a Supabase write per keystroke.
    const timerId = window.setTimeout(() => {
      void saveRemoteTournament(tournament)
    }, 800)
    return () => window.clearTimeout(timerId)
  }, [tournament, tournamentLoaded])

  const playerNameById = useMemo(
    () => new Map(standings.map((player) => [player.id, player.name])),
    [standings],
  )
  const nameOf = (playerId: string) => playerNameById.get(playerId) ?? 'Unknown'

  const playerOptions = useMemo<ThemedSelectOption[]>(
    () => standings.map((player) => ({ value: player.id, label: player.name })),
    [standings],
  )

  const seededSelection = useMemo(
    () => standings.filter((player) => selectedIds.includes(player.id)).map((player) => player.id),
    [selectedIds, standings],
  )

  function togglePlayer(playerId: string) {
    setFormError('')
    setSelectedIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    )
  }

  function removePlayer(playerId: string) {
    setSelectedIds((current) => current.filter((id) => id !== playerId))
  }

  function clearPlayers() {
    setFormError('')
    setSelectedIds([])
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
    setDraftSavedAt(null)
    setTournament((current) => {
      if (!current || !current.rounds[roundIndex]) return current
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

  // Swap the player in one slot of one match (e.g. when someone leaves and a
  // substitute takes their place). The court roster is recomputed from its games
  // and any newly introduced player joins the tournament roster (seeded last).
  function updatePlayer(
    roundIndex: number,
    courtIndex: number,
    gameIndex: number,
    team: 'teamA' | 'teamB',
    slot: 0 | 1,
    playerId: string,
  ) {
    setFormError('')
    setDraftSavedAt(null)
    setTournament((current) => {
      if (!current || !current.rounds[roundIndex]) return current
      const round = current.rounds[roundIndex]
      const courts = round.courts.map((court, cIndex) => {
        if (cIndex !== courtIndex) return court
        const games = court.games.map((game, gIndex) => {
          if (gIndex !== gameIndex) return game
          const teamA: [string, string] = [...game.teamA]
          const teamB: [string, string] = [...game.teamB]
          const previous = game[team][slot]
          // If the chosen player already sits in another seat of this game, swap
          // them in (move the displaced player to the vacated seat) so the same
          // player never appears twice — which would double-count their record.
          if (playerId) {
            const seats: Array<['teamA' | 'teamB', 0 | 1]> = [
              ['teamA', 0],
              ['teamA', 1],
              ['teamB', 0],
              ['teamB', 1],
            ]
            for (const [t, s] of seats) {
              if (t === team && s === slot) continue
              const pair = t === 'teamA' ? teamA : teamB
              if (pair[s] === playerId) pair[s] = previous
            }
          }
          ;(team === 'teamA' ? teamA : teamB)[slot] = playerId
          return { ...game, teamA, teamB }
        })
        return { ...court, games, playerIds: courtRosterFromGames(games) }
      })
      const playerIds = current.playerIds.includes(playerId)
        ? current.playerIds
        : [...current.playerIds, playerId]
      return {
        ...current,
        playerIds,
        rounds: current.rounds.map((entry, index) =>
          index === roundIndex ? { ...round, courts } : entry,
        ),
      }
    })
  }

  // Add a player to the tournament roster, or remove one. Removing a player who
  // is in matches leaves an empty seat (shown as "—") for you to fill via "Edit
  // Round"; you can't advance or finish while a seat is empty.
  function toggleTournamentPlayer(playerId: string) {
    if (!tournament) return
    setFormError('')
    setDraftSavedAt(null)
    const inRoster = tournament.playerIds.includes(playerId)
    if (!inRoster) {
      setTournament((current) =>
        current ? { ...current, playerIds: [...current.playerIds, playerId] } : current,
      )
      return
    }

    const blankSlot = (id: string) => (id === playerId ? '' : id)
    setTournament((current) => {
      if (!current) return current
      const satOutCounts = { ...current.satOutCounts }
      delete satOutCounts[playerId]
      return {
        ...current,
        playerIds: current.playerIds.filter((id) => id !== playerId),
        satOutCounts,
        rounds: current.rounds.map((round) => ({
          ...round,
          sitOutIds: round.sitOutIds.filter((id) => id !== playerId),
          courts: round.courts.map((court) => ({
            ...court,
            playerIds: court.playerIds.filter((id) => id !== playerId),
            games: court.games.map((game) => ({
              ...game,
              teamA: [blankSlot(game.teamA[0]), blankSlot(game.teamA[1])] as [string, string],
              teamB: [blankSlot(game.teamB[0]), blankSlot(game.teamB[1])] as [string, string],
              sitOutIds: game.sitOutIds?.filter((id) => id !== playerId),
            })),
          })),
        })),
      }
    })
  }

  async function saveProgress() {
    if (!tournament) return
    setSavingDraft(true)
    await saveRemoteTournament(tournament)
    setSavingDraft(false)
    setDraftSavedAt(new Date().toISOString())
  }

  function advanceRound() {
    if (!tournament) return
    const round = tournament.rounds[tournament.rounds.length - 1]
    if (!isRoundComplete(round)) {
      setFormError('Enter a score for every game first (winner and loser scores must differ).')
      return
    }
    setActiveRoundIndex(tournament.rounds.length)
    setTournament(buildNextRound(tournament))
  }

  // Re-run promotion/relegation for every round after roundIndex using its
  // (possibly edited) scores. Clears any scores already entered in those later
  // rounds, since the court line-ups change.
  function rebuildFollowing(roundIndex: number) {
    if (!tournament) return
    const round = tournament.rounds[roundIndex]
    if (!isRoundComplete(round)) {
      setFormError('Finish scoring this round before rebuilding the rounds after it.')
      return
    }
    const laterCount = tournament.rounds.length - roundIndex - 1
    if (laterCount === 0) return
    const confirmed = window.confirm(
      `Rebuild the ${laterCount} round${laterCount === 1 ? '' : 's'} after Round ${round.round} from these scores? Any scores already entered in those later rounds will be cleared.`,
    )
    if (!confirmed) return
    setTournament(rebuildRoundsAfter(tournament, roundIndex))
    setActiveRoundIndex(roundIndex + 1)
    setFormError('')
  }

  // Commit the tournament to the leaderboard, then clear it. Games that were
  // never scored (ran out of time) or still have a missing player are simply
  // skipped — only completed games are saved.
  async function finishTournament() {
    if (!tournament) return

    // A scored game must have four distinct players or the leaderboard will
    // reject it. Point the user at the exact game to fix rather than failing
    // with a database error.
    const problems: string[] = []
    tournament.rounds.forEach((round) => {
      round.courts.forEach((court) => {
        court.games.forEach((game, gameIndex) => {
          if (game.skipped || !parseGameScores(game)) return
          if (!gameHasAllPlayers(game)) {
            problems.push(`Round ${round.round} · Court ${court.court} · Game ${gameIndex + 1}`)
          }
        })
      })
    })
    if (problems.length > 0) {
      setFormError(
        `Fix the line-up (a missing or repeated player) in ${problems.join(', ')} before finishing.`,
      )
      return
    }

    const matches: Match[] = tournament.rounds.flatMap((round) =>
      round.courts.flatMap((court) =>
        court.games.flatMap((game) => {
          if (game.skipped) return []
          const scores = parseGameScores(game)
          if (!scores) return []
          if (!gameHasAllPlayers(game)) return []
          const winnerIsA = scores.scoreA > scores.scoreB
          return [
            {
              id: makeId('m'),
              week: formatResultsLabel(tournament.playedOn),
              playedOn: tournament.playedOn,
              teamA: winnerIsA ? game.teamA : game.teamB,
              teamB: winnerIsA ? game.teamB : game.teamA,
              scoreA: winnerIsA ? scores.scoreA : scores.scoreB,
              scoreB: winnerIsA ? scores.scoreB : scores.scoreA,
            },
          ]
        }),
      ),
    )

    if (matches.length === 0) {
      setFormError('Enter at least one game score before finishing (or “End tournament” to discard).')
      return
    }

    setSaving(true)
    const saved = await saveRoundMatches(matches)
    setSaving(false)
    if (!saved) return

    setTournament(null)
    setSelectedIds([])
    setActiveRoundIndex(0)
    setEditLineups(false)
    onFinished?.()
  }

  // Grey out / restore a whole game (a "Game N" row across every court) — e.g.
  // when there isn't enough time to play it. Reversible.
  function toggleGameSkipped(gameIndex: number) {
    if (!tournament) return
    setFormError('')
    setDraftSavedAt(null)
    setTournament((current) => {
      if (!current) return current
      return {
        ...current,
        rounds: current.rounds.map((entry, index) =>
          index === activeRoundIndex
            ? {
                ...entry,
                courts: entry.courts.map((court) => ({
                  ...court,
                  games: court.games.map((game, gIndex) =>
                    gIndex === gameIndex ? { ...game, skipped: !game.skipped } : game,
                  ),
                })),
              }
            : entry,
        ),
      }
    })
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
            <DatePicker value={playedOn} onChange={(value) => setPlayedOn(value)} />
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

        <div className="tournament-roster">
          <div className="tournament-roster-head">
            <span className="tournament-roster-title">Players</span>
            <div className="tournament-roster-actions">
              {selectedIds.length > 0 ? (
                <button type="button" className="ghost-button" onClick={clearPlayers}>
                  <RotateCcw size={15} />
                  Clear all
                </button>
              ) : null}
              <button
                type="button"
                className="primary-button"
                onClick={() => setPickerOpen(true)}
              >
                <Users size={16} />
                Add players
              </button>
            </div>
          </div>

          {selectedIds.length > 0 ? (
            <div className="selected-player-chips" role="list" aria-label="Selected players">
              {selectedIds.map((playerId) => (
                <span key={playerId} className="player-chip" role="listitem">
                  <span>{nameOf(playerId)}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${nameOf(playerId)}`}
                    onClick={() => removePlayer(playerId)}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="tournament-roster-empty"
              onClick={() => setPickerOpen(true)}
            >
              No players yet — tap “Add players” to build the roster.
            </button>
          )}
        </div>

        <PlayerPickerDialog
          open={pickerOpen}
          players={standings}
          selectedIds={selectedIds}
          onToggle={togglePlayer}
          onClear={clearPlayers}
          onClose={() => setPickerOpen(false)}
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
  const roundHasEmptySlot = (round: TournamentRound) =>
    round.courts.some((court) =>
      court.games.some((game) => !game.skipped && !gameHasAllPlayers(game)),
    )
  const activeRoundHasGap = roundHasEmptySlot(activeRound)
  const anyRoundHasGap = tournament.rounds.some(roundHasEmptySlot)
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
        <div className="tournament-toolbar-actions">
          <button type="button" className="ghost-button" onClick={() => setPickerOpen(true)}>
            <Users size={16} />
            Manage players
          </button>
          <button type="button" className="ghost-button tournament-cancel" onClick={cancelTournament}>
            <X size={16} />
            End tournament
          </button>
        </div>
      </div>

      <TournamentTimer />

      <div className="tournament-round-tabs" role="tablist" aria-label="Tournament rounds">
        {tournament.rounds.map((round, index) => (
          <RoundTab
            key={round.round}
            round={round.round}
            isActive={index === activeRoundIndex}
            isSaved={index < latestRoundIndex}
            isComplete={isRoundComplete(round)}
            onSelect={() => setActiveRoundIndex(index)}
          />
        ))}
      </div>

      <div className="tournament-lineup-bar">
        <button
          type="button"
          className="ghost-button"
          onClick={() => setEditLineups((value) => !value)}
        >
          <Users size={15} />
          {editLineups ? 'Finish Editing' : 'Edit Round'}
        </button>
        {editLineups ? (
          <span className="tournament-lineup-hint">
            Tap a name to swap in a different player (e.g. if someone leaves).
          </span>
        ) : null}
        {editLineups && !isCurrentRound ? (
          <button
            type="button"
            className="primary-button tournament-lineup-rebuild"
            onClick={() => rebuildFollowing(activeRoundIndex)}
            disabled={!roundDone}
          >
            <RefreshCw size={16} />
            Rebuild
          </button>
        ) : null}
      </div>

      <TournamentRoundView
        round={activeRound}
        readOnly={false}
        editPlayers={editLineups}
        nameOf={nameOf}
        seedOrderIds={tournament.playerIds}
        playerOptions={playerOptions}
        onUpdateScore={(courtIndex, gameIndex, field, value) =>
          updateScore(activeRoundIndex, courtIndex, gameIndex, field, value)
        }
        onUpdatePlayer={(courtIndex, gameIndex, team, slot, value) =>
          updatePlayer(activeRoundIndex, courtIndex, gameIndex, team, slot, value)
        }
        onToggleSkipGame={toggleGameSkipped}
      />

      {formError ? <p className="form-error">{formError}</p> : null}
      {anyRoundHasGap ? (
        <p className="tournament-round-hint editing">
          A court has a missing seat (—) or the same player twice. Use “Edit Round” to give every
          game four different players before moving on.
        </p>
      ) : null}

      <div className="tournament-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={saveProgress}
          disabled={savingDraft || saving}
        >
          <Save size={16} />
          {savingDraft ? 'Saving…' : 'Save progress'}
        </button>
        {isCurrentRound ? (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={advanceRound}
              disabled={!roundDone || saving || activeRoundHasGap}
            >
              <ArrowRight size={17} />
              Next round
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={finishTournament}
              disabled={saving}
            >
              <Flag size={16} />
              {saving ? 'Saving…' : 'Finish Tournament'}
            </button>
          </>
        ) : null}
        {draftSavedAt ? (
          <span className="tournament-draft-saved">
            <Check size={14} aria-hidden />
            Progress saved {new Date(draftSavedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        ) : null}
      </div>

      <PlayerPickerDialog
        open={pickerOpen}
        players={standings}
        selectedIds={tournament.playerIds}
        onToggle={toggleTournamentPlayer}
        onClear={() => setFormError('Remove players one at a time so the matches stay intact.')}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  )
}
