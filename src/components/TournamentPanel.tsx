import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Flag, Trophy, X } from 'lucide-react'
import { AdminField, FieldInput, FieldInputWrap } from './AdminField'
import { PlayerSearchAdd } from './PlayerSearchAdd'
import { formatResultsLabel, makeId } from '../lib/data'
import {
  buildNextRound,
  createTournament,
  isRoundComplete,
  parseGameScores,
  rankCourtPlayers,
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

export function TournamentPanel({
  standings,
  saveRoundMatches,
}: {
  standings: PlayerStanding[]
  saveRoundMatches: (matches: Match[]) => Promise<boolean>
}) {
  const [tournament, setTournament] = useState<TournamentState | null>(loadStoredTournament)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

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
    setTournament(createTournament(seededSelection, playedOn))
  }

  function updateScore(courtIndex: number, gameIndex: number, field: 'scoreA' | 'scoreB', value: string) {
    setFormError('')
    setTournament((current) => {
      if (!current) return current
      const round = current.rounds[current.rounds.length - 1]
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
        rounds: [...current.rounds.slice(0, -1), { ...round, courts }],
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
    } else {
      setTournament(buildNextRound(tournament))
    }
  }

  function cancelTournament() {
    if (!window.confirm('End this tournament? Unsaved scores in the current round will be lost.')) {
      return
    }
    setTournament(null)
    setSelectedIds([])
    setFormError('')
  }

  if (!tournament) {
    const courtCount = Math.floor(seededSelection.length / 4)
    const sitOutCount = seededSelection.length % 4

    return (
      <section className="panel tournament-panel">
        <div className="panel-heading">
          <div>
            <h2>Tournament setup</h2>
            <p>
              Search players by name, add them to the list, then generate round 1. Players are
              seeded by current rating: the top 4 share court 1, the next 4 court 2, and so on.
            </p>
          </div>
        </div>

        <div className="tournament-setup-row">
          <AdminField label="Date">
            <FieldInput
              type="date"
              value={playedOn}
              onChange={(event) => setPlayedOn(event.target.value)}
            />
          </AdminField>
          <div className="tournament-setup-summary">
            <span>
              {seededSelection.length} selected · {courtCount} court{courtCount === 1 ? '' : 's'}
              {sitOutCount > 0 ? ` · ${sitOutCount} sitting out each round` : ''}
            </span>
          </div>
        </div>

        <PlayerSearchAdd
          players={standings}
          selectedIds={selectedIds}
          onAdd={addPlayer}
          onRemove={removePlayer}
        />

        {formError ? <p className="form-error">{formError}</p> : null}
        <div className="form-actions">
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

  const round = tournament.rounds[tournament.rounds.length - 1]
  const roundDone = isRoundComplete(round)

  return (
    <section className="panel tournament-panel">
      <div className="panel-heading tournament-round-heading">
        <div>
          <h2>Round {round.round}</h2>
          <p>
            Enter every score, then move to the next round. Games save to the leaderboard when the
            round is completed.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={cancelTournament}>
          <X size={16} />
          Cancel tournament
        </button>
      </div>

      {round.sitOutIds.length > 0 ? (
        <p className="sitout-note">
          Sitting out this round: {round.sitOutIds.map(nameOf).join(', ')}
        </p>
      ) : null}

      <div className="court-grid">
        {round.courts.map((court, courtIndex) => {
          const ranking = rankCourtPlayers(court)
          const courtComplete = court.games.every((game) => parseGameScores(game))
          return (
            <article className="court-card" key={court.court}>
              <header className="court-card-head">
                <h3>Court {court.court}</h3>
                <span>{court.playerIds.map(nameOf).join(' · ')}</span>
              </header>

              {court.games.map((game, gameIndex) => (
                <div className="tournament-game-row" key={game.id}>
                  <span className="game-number">G{gameIndex + 1}</span>
                  <div className="tournament-team">
                    <span>{nameOf(game.teamA[0])}</span>
                    <span>{nameOf(game.teamA[1])}</span>
                  </div>
                  <FieldInputWrap className="tournament-score-input">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="–"
                      aria-label={`Court ${court.court} game ${gameIndex + 1} first team score`}
                      value={game.scoreA}
                      onChange={(event) =>
                        updateScore(courtIndex, gameIndex, 'scoreA', event.target.value)
                      }
                    />
                  </FieldInputWrap>
                  <span className="score-divider">v</span>
                  <FieldInputWrap className="tournament-score-input">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="–"
                      aria-label={`Court ${court.court} game ${gameIndex + 1} second team score`}
                      value={game.scoreB}
                      onChange={(event) =>
                        updateScore(courtIndex, gameIndex, 'scoreB', event.target.value)
                      }
                    />
                  </FieldInputWrap>
                  <div className="tournament-team away">
                    <span>{nameOf(game.teamB[0])}</span>
                    <span>{nameOf(game.teamB[1])}</span>
                  </div>
                </div>
              ))}

              {courtComplete ? (
                <footer className="court-standings">
                  {ranking.map((result, index) => (
                    <span
                      key={result.playerId}
                      className={
                        index < 2 ? 'court-rank moving-up' : 'court-rank moving-down'
                      }
                    >
                      {index + 1}. {nameOf(result.playerId)} ({result.wins}W,{' '}
                      {result.pointDiff >= 0 ? '+' : ''}
                      {result.pointDiff})
                    </span>
                  ))}
                </footer>
              ) : null}
            </article>
          )
        })}
      </div>

      {formError ? <p className="form-error">{formError}</p> : null}
      <div className="form-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => completeRound(false)}
          disabled={!roundDone || saving}
        >
          <ArrowRight size={17} />
          {saving ? 'Saving…' : 'Save round & generate next round'}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => completeRound(true)}
          disabled={!roundDone || saving}
        >
          <Flag size={16} />
          Save round & finish
        </button>
      </div>
    </section>
  )
}
