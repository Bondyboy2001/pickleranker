import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Check, Flag, Trophy, Users, X } from 'lucide-react'
import { AdminField, FieldInput, FieldInputWrap } from './AdminField'
import { PlayerSearchAdd } from './PlayerSearchAdd'
import { formatPlayedOnDate, formatResultsLabel, makeId } from '../lib/data'
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

const TOURNAMENT_STORAGE_KEY = 'pickleranker-tournament-v1'

function loadStoredTournament(): TournamentState | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(TOURNAMENT_STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as TournamentState
    if (!Array.isArray(parsed.rounds) || parsed.rounds.length === 0) return null
    return parsed
  } catch {
    return null
  }
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
  return (
    <>
      {round.sitOutIds.length > 0 ? (
        <p className="tournament-sitout-note">
          <Users size={16} aria-hidden />
          <span>
            Sitting out: <strong>{round.sitOutIds.map(nameOf).join(', ')}</strong>
          </span>
        </p>
      ) : null}

      <div className="tournament-court-grid">
        {round.courts.map((court, courtIndex) => {
          const ranking = rankCourtPlayers(court)
          const courtComplete = court.games.every((game) => parseGameScores(game))
          return (
            <article className="tournament-court-card" key={court.court}>
              <header className="tournament-court-head">
                <span className="tournament-court-badge">Court {court.court}</span>
                <div className="tournament-court-players">
                  {court.playerIds.map((playerId) => (
                    <span className="tournament-court-player" key={playerId}>
                      {nameOf(playerId)}
                    </span>
                  ))}
                </div>
              </header>

              <div className="tournament-games">
                {court.games.map((game, gameIndex) => (
                  <div className="tournament-match" key={game.id}>
                    <span className="tournament-match-label">Game {gameIndex + 1}</span>
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
                  </div>
                ))}
              </div>

              {courtComplete ? (
                <footer className="tournament-court-results">
                  <span className="tournament-results-label">Court finish</span>
                  <div className="tournament-court-standings">
                    {ranking.map((result, index) => (
                      <span
                        key={result.playerId}
                        className={
                          index < 2 ? 'tournament-rank moving-up' : 'tournament-rank moving-down'
                        }
                      >
                        {index + 1}. {nameOf(result.playerId)} · {result.wins}W ·{' '}
                        {result.pointDiff >= 0 ? '+' : ''}
                        {result.pointDiff}
                      </span>
                    ))}
                  </div>
                </footer>
              ) : null}
            </article>
          )
        })}
      </div>
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
  const initialTournament = useMemo(() => loadStoredTournament(), [])
  const [tournament, setTournament] = useState<TournamentState | null>(initialTournament)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeRoundIndex, setActiveRoundIndex] = useState(() =>
    initialTournament ? initialTournament.rounds.length - 1 : 0,
  )

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (tournament) {
      localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament))
    } else {
      localStorage.removeItem(TOURNAMENT_STORAGE_KEY)
    }
  }, [tournament])

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
              <p>
                Add players, pick a date, then generate round 1. Top-rated players seed court 1,
                then court 2, and so on.
              </p>
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
                {sitOutCount} sit out each round
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
            Generate round 1
          </button>
        </div>
      </section>
    )
  }

  const latestRoundIndex = tournament.rounds.length - 1
  const activeRound = tournament.rounds[activeRoundIndex]
  const isCurrentRound = activeRoundIndex === latestRoundIndex
  const roundDone = isRoundComplete(activeRound)

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
        </div>
        <button type="button" className="ghost-button tournament-cancel" onClick={cancelTournament}>
          <X size={16} />
          End tournament
        </button>
      </div>

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

      {isCurrentRound ? (
        <p className="tournament-round-hint">
          Enter every score for round {activeRound.round}, then save to the leaderboard.
        </p>
      ) : (
        <p className="tournament-round-hint saved">Round {activeRound.round} saved — view only.</p>
      )}

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
