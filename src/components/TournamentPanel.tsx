import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  Flag,
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
import { TournamentTimer } from './TournamentTimer'
import { type ThemedSelectOption } from './ThemedSelect'
import { PlayerSlotSelect } from './PlayerSlotSelect'
import { formatPlayedOnDate, formatResultsLabel, makeId } from '../lib/data'
import {
  archiveFinishedTournament,
  loadRemoteTournament,
  saveRemoteTournament,
} from '../lib/tournamentStorage'
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

const MOVE_CLASS: Record<CourtMovement, string> = {
  up: 'moving-up',
  down: 'moving-down',
  stays: 'staying',
}

const DEMO_PLAYERS = Array.from({ length: 15 }, (_, index) => ({
  id: `demo-player-${index + 1}`,
  name: `Player ${index + 1}`,
}))
const DEMO_PLAYER_IDS = new Set(DEMO_PLAYERS.map((player) => player.id))

const DEMO_SCORES: Array<[string, string]> = [
  ['11', '7'],
  ['9', '11'],
  ['11', '5'],
  ['8', '11'],
  ['11', '9'],
  ['6', '11'],
]

function scoreDemoLatestRound(state: TournamentState): TournamentState {
  const latestRoundIndex = state.rounds.length - 1
  return {
    ...state,
    rounds: state.rounds.map((round, roundIndex) =>
      roundIndex === latestRoundIndex
        ? {
            ...round,
            courts: round.courts.map((court, courtIndex) => ({
              ...court,
              games: court.games.map((game, gameIndex) => {
                const [scoreA, scoreB] =
                  DEMO_SCORES[
                    (roundIndex * round.courts.length + courtIndex + gameIndex) % DEMO_SCORES.length
                  ]
                return { ...game, scoreA, scoreB }
              }),
            })),
          }
        : round,
    ),
  }
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
          // Courts can hold different game counts (e.g. a reopened tournament
          // rebuilt from saved scores), so this seat may not exist on every court.
          const courtsWithGame = round.courts.filter((court) => court.games[gameIndex])
          const scoredCount = courtsWithGame.filter((court) => parseGameScores(court.games[gameIndex])).length
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
                    {skipped ? 'Skipped' : `${scoredCount}/${courtsWithGame.length} scored`}
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
  openTournament,
}: {
  standings: PlayerStanding[]
  saveRoundMatches: (matches: Match[]) => Promise<boolean>
  onFinished?: () => void
  // When set, load this finished bracket for editing instead of the active
  // draft. Re-finishing replaces that date's results on the leaderboard.
  openTournament?: TournamentState | null
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
  const [isDemoTournament, setIsDemoTournament] = useState(false)
  const [tournamentNotice, setTournamentNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    // Reopening a finished tournament: load it straight in for editing rather
    // than the active draft. The draft auto-save then keeps it as the working
    // tournament until it's re-finished.
    if (openTournament) {
      setTournament(openTournament)
      setActiveRoundIndex(Math.max(0, openTournament.rounds.length - 1))
      setSelectedIds([])
      setFormError('')
      setIsDemoTournament(false)
      setTournamentNotice('')
      setTournamentLoaded(true)
      return () => {
        cancelled = true
      }
    }
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
  }, [openTournament])

  const hasDemoPlayers = tournament?.playerIds.some((playerId) => DEMO_PLAYER_IDS.has(playerId)) ?? false
  const isDemoMode = isDemoTournament || hasDemoPlayers

  useEffect(() => {
    if (!tournamentLoaded) return
    if (isDemoMode) return
    // Debounce so rapid score edits don't fire a Supabase write per keystroke.
    const timerId = window.setTimeout(() => {
      void saveRemoteTournament(tournament)
    }, 800)
    return () => window.clearTimeout(timerId)
  }, [isDemoMode, tournament, tournamentLoaded])

  const tournamentPlayers = useMemo(
    () => (isDemoMode ? [...standings, ...DEMO_PLAYERS] : standings),
    [isDemoMode, standings],
  )
  const playerNameById = useMemo(
    () => new Map(tournamentPlayers.map((player) => [player.id, player.name])),
    [tournamentPlayers],
  )
  const nameOf = (playerId: string) => playerNameById.get(playerId) ?? 'Unknown'

  const playerOptions = useMemo<ThemedSelectOption[]>(
    () =>
      tournamentPlayers.map((player) => ({
        value: player.id,
        label: player.name,
      })),
    [tournamentPlayers],
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
    setTournamentNotice('')
    setActiveRoundIndex(0)
    setTournamentLoaded(true)
    setIsDemoTournament(false)
    setTournament(createTournament(seededSelection, playedOn))
  }

  function loadDemoTournament() {
    const playerIds = DEMO_PLAYERS.map((player) => player.id)
    const roundOne = scoreDemoLatestRound(createTournament(playerIds, playedOn, () => 0.42))
    const roundTwo = scoreDemoLatestRound(buildNextRound(roundOne, () => 0.42))
    setSelectedIds([])
    setFormError('')
    setTournamentNotice('Demo tournament loaded. It will not be saved to the leaderboard.')
    setDraftSavedAt(null)
    setEditLineups(false)
    setActiveRoundIndex(0)
    setTournamentLoaded(true)
    setIsDemoTournament(true)
    setTournament(roundTwo)
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
  // has already completed the active source round keeps those historical games
  // intact, but clears them from later rounds so the next-round generator can
  // reseed from the remaining roster.
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
      const shouldKeepRoundLineups = (roundIndex: number, round: TournamentRound) =>
        roundIndex < activeRoundIndex || (roundIndex === activeRoundIndex && isRoundComplete(round))
      return {
        ...current,
        playerIds: current.playerIds.filter((id) => id !== playerId),
        satOutCounts,
        rounds: current.rounds.map((round, roundIndex) => {
          if (shouldKeepRoundLineups(roundIndex, round)) return round
          return {
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
          }
        }),
      }
    })
  }

  async function saveProgress() {
    if (!tournament) return
    if (isDemoMode) {
      setTournamentNotice('Demo tournaments are for testing only and are not saved.')
      return
    }
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
    setTournamentNotice(
      `Regenerated ${laterCount} round${laterCount === 1 ? '' : 's'} after Round ${round.round}.`,
    )
  }

  // Commit the tournament to the leaderboard, then clear it. Games that were
  // never scored (ran out of time) or still have a missing player are simply
  // skipped — only completed games are saved.
  async function finishTournament() {
    if (!tournament) return
    if (isDemoMode) {
      setFormError('Demo tournaments are for testing only. End the demo instead of saving it.')
      return
    }

    // Every game in every round must be scored or skipped before finishing, so a
    // half-entered bracket can't be committed to the leaderboard.
    const incompleteIndex = tournament.rounds.findIndex((round) => !isRoundComplete(round))
    if (incompleteIndex !== -1) {
      setActiveRoundIndex(incompleteIndex)
      setFormError(
        `Enter a score for every game (or skip it) in Round ${tournament.rounds[incompleteIndex].round} before finishing the tournament.`,
      )
      return
    }

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
              round: round.round,
              court: court.court,
            },
          ]
        }),
      ),
    )

    if (matches.length === 0) {
      setFormError('Enter at least one game score before finishing (or “End tournament” to discard).')
      return
    }

    // Final confirmation — this commits the scores and updates everyone's
    // rankings, so make the user opt in before it happens.
    const confirmed = window.confirm(
      `Finish this tournament and save ${matches.length} game${matches.length === 1 ? '' : 's'} to the leaderboard? This updates everyone's rankings and can't be undone from here.`,
    )
    if (!confirmed) return

    setSaving(true)
    const saved = await saveRoundMatches(matches)
    if (!saved) {
      setSaving(false)
      return
    }
    // Archive the full bracket (keyed by date) so this tournament can be
    // reopened and edited later, then re-finished to replace its results.
    await archiveFinishedTournament(tournament)
    // Delete the saved draft now. The debounced auto-save would be cancelled
    // when this panel unmounts (onFinished switches tabs), leaving the old
    // bracket to reload — so clear it explicitly to blank the tournament page.
    await saveRemoteTournament(null)
    setSaving(false)

    setTournament(null)
    setSelectedIds([])
    setActiveRoundIndex(0)
    setEditLineups(false)
    setIsDemoTournament(false)
    setTournamentNotice('')
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
    setIsDemoTournament(false)
    setTournamentNotice('')
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
                {sitOutCount} random sit-out{sitOutCount === 1 ? '' : 's'} per round
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
            className="ghost-button"
            onClick={loadDemoTournament}
          >
            <RefreshCw size={16} />
            Load demo tournament
          </button>
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
        {editLineups ? (
          <span className="tournament-lineup-hint">
            Tap a name to swap in a different player (e.g. if someone leaves).
          </span>
        ) : null}
        <div className="tournament-lineup-actions">
          {!isCurrentRound ? (
            <button
              type="button"
              className="primary-button tournament-lineup-rebuild"
              onClick={() => rebuildFollowing(activeRoundIndex)}
              disabled={!roundDone}
            >
              <RefreshCw size={16} />
              Regenerate next rounds
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button tournament-lineup-edit"
            onClick={() => setEditLineups((value) => !value)}
          >
            <Users size={15} />
            {editLineups ? 'Finish Editing' : 'Edit Round'}
          </button>
        </div>
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
      {tournamentNotice ? (
        <p className="tournament-round-hint saved" role="status">
          {tournamentNotice}
        </p>
      ) : null}
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
          disabled={savingDraft || saving || isDemoMode}
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
              disabled={saving || isDemoMode}
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
        players={tournamentPlayers}
        selectedIds={tournament.playerIds}
        onToggle={toggleTournamentPlayer}
        onClear={() => setFormError('Remove players one at a time so the matches stay intact.')}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  )
}
