import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Flag, Plus, Search, Trophy, X } from 'lucide-react'
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

  // Autocomplete state
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  const availablePlayers = useMemo(
    () =>
      standings.filter(
        (player) =>
          !selectedIds.includes(player.id) &&
          player.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [standings, selectedIds, query],
  )

  function addPlayer(playerId: string) {
    setFormError('')
    setQuery('')
    setSelectedIds((current) => (current.includes(playerId) ? current : [...current, playerId]))
    setOpen(false)
    setHighlightIndex(0)
    inputRef.current?.focus()
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
    setQuery('')
    setOpen(false)
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlightIndex((i) => Math.min(i + 1, availablePlayers.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const player = availablePlayers[highlightIndex]
      if (player) {
        addPlayer(player.id)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      const target = event.target as Node
      if (!inputRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

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
          <label>
            Date
            <input
              type="date"
              value={playedOn}
              onChange={(event) => setPlayedOn(event.target.value)}
            />
          </label>
          <div className="tournament-setup-summary">
            <span>
              {seededSelection.length} selected · {courtCount} court{courtCount === 1 ? '' : 's'}
              {sitOutCount > 0 ? ` · ${sitOutCount} sitting out each round` : ''}
            </span>
          </div>
        </div>

        <div className="player-autocomplete">
          <div className="autocomplete-input-wrap">
            <Search size={16} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a player name..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setOpen(true)
                setHighlightIndex(0)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? 'player-suggestions' : undefined}
              aria-activedescendant={open ? `suggestion-${highlightIndex}` : undefined}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Add player"
              onClick={() => {
                const player = availablePlayers[0]
                if (player) addPlayer(player.id)
              }}
              disabled={availablePlayers.length === 0}
            >
              <Plus size={16} />
            </button>
          </div>

          {open && availablePlayers.length > 0 ? (
            <div ref={listRef} className="autocomplete-dropdown" id="player-suggestions" role="listbox">
              {availablePlayers.map((player, index) => (
                <div
                  key={player.id}
                  id={`suggestion-${index}`}
                  className={index === highlightIndex ? 'suggestion-highlight' : ''}
                  role="option"
                  aria-selected={index === highlightIndex}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => addPlayer(player.id)}
                >
                  {player.name}
                </div>
              ))}
            </div>
          ) : null}

          {open && query.trim() && availablePlayers.length === 0 ? (
            <div className="autocomplete-dropdown empty">
              No players match “{query.trim()}”
            </div>
          ) : null}
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
        ) : null}

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
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="–"
                    aria-label={`Court ${court.court} game ${gameIndex + 1} first team score`}
                    value={game.scoreA}
                    onChange={(event) => updateScore(courtIndex, gameIndex, 'scoreA', event.target.value)}
                  />
                  <span className="score-divider">v</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="–"
                    aria-label={`Court ${court.court} game ${gameIndex + 1} second team score`}
                    value={game.scoreB}
                    onChange={(event) => updateScore(courtIndex, gameIndex, 'scoreB', event.target.value)}
                  />
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
