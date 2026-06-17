import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, RotateCcw, Search, Users, X } from 'lucide-react'
import { FieldInputWrap } from './AdminField'

type Player = { id: string; name: string }

export function PlayerPickerDialog({
  open,
  players,
  selectedIds,
  onToggle,
  onClear,
  onClose,
}: {
  open: boolean
  players: Player[]
  selectedIds: string[]
  onToggle: (playerId: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])

  useEffect(() => {
    if (!open) return
    setQuery('')
    inputRef.current?.focus()
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const selectedPlayers = useMemo(
    () => selectedIds.map((playerId) => playerById.get(playerId)).filter((player): player is Player => Boolean(player)),
    [playerById, selectedIds],
  )

  const availablePlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return players
      .filter(
        (player) =>
          !selected.has(player.id) &&
          player.name.toLowerCase().includes(normalizedQuery),
      )
      .sort((first, second) => first.name.localeCompare(second.name))
  }, [players, query, selected])

  if (!open) return null

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog player-picker"
        role="dialog"
        aria-label="Add players"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="player-picker-head">
          <div>
            <h3>Add players</h3>
            <span>{selectedIds.length} selected</span>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <FieldInputWrap className="player-picker-search" icon={<Search size={16} />}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search players..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            aria-label="Search players"
          />
        </FieldInputWrap>

        <div className="player-picker-columns">
          <section className="player-picker-column" aria-labelledby="selected-players-title">
            <div className="player-picker-column-head">
              <h4 id="selected-players-title">Added players</h4>
              <span>{selectedPlayers.length}</span>
            </div>
            <div className="player-picker-list" role="listbox" aria-label="Added players">
              {selectedPlayers.length === 0 ? (
                <p className="player-picker-empty">No players added yet.</p>
              ) : (
                selectedPlayers.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    role="option"
                    aria-selected="true"
                    className="player-picker-option selected"
                    onClick={() => onToggle(player.id)}
                  >
                    <span>{player.name}</span>
                    <span className="player-picker-check remove" aria-hidden>
                      <X size={15} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="player-picker-column" aria-labelledby="available-players-title">
            <div className="player-picker-column-head">
              <h4 id="available-players-title">Available players</h4>
              <span>{availablePlayers.length}</span>
            </div>
            <div
              className="player-picker-list"
              role="listbox"
              aria-label="Available players"
              aria-multiselectable="true"
            >
              {availablePlayers.length === 0 ? (
                <p className="player-picker-empty">
                  {query.trim() ? `No players match "${query.trim()}".` : 'Everyone has been added.'}
                </p>
              ) : (
                availablePlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="player-picker-option"
                  onClick={() => onToggle(player.id)}
                >
                  <span>{player.name}</span>
                  <span className="player-picker-check" aria-hidden>
                    <Check size={16} />
                  </span>
                </button>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="player-picker-foot">
          <span className="player-picker-count">
            <Users size={15} aria-hidden /> {selectedIds.length} selected
          </span>
          <div className="player-picker-foot-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={onClear}
              disabled={selectedIds.length === 0}
            >
              <RotateCcw size={15} />
              Clear all
            </button>
            <button type="button" className="primary-button" onClick={onClose}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
