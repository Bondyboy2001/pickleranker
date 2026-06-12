import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { FieldInputWrap } from './AdminField'
type PlayerSearchAddProps = {
  players: Array<{ id: string; name: string }>
  selectedIds: string[]
  onAdd: (playerId: string) => void
  onRemove: (playerId: string) => void
  placeholder?: string
}

export function PlayerSearchAdd({
  players,
  selectedIds,
  onAdd,
  onRemove,
  placeholder = 'Type a player name...',
}: PlayerSearchAddProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const nameById = useMemo(() => new Map(players.map((player) => [player.id, player.name])), [players])

  const suggestions = useMemo(
    () =>
      players.filter(
        (player) =>
          !selectedIds.includes(player.id) &&
          player.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [players, selectedIds, query],
  )

  function addPlayer(playerId: string) {
    onAdd(playerId)
    setQuery('')
    setOpen(false)
    setHighlightIndex(0)
    inputRef.current?.focus()
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlightIndex((index) => Math.min(index + 1, suggestions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const player = suggestions[highlightIndex]
      if (player) addPlayer(player.id)
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

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

  return (
    <div className="player-autocomplete">
      <FieldInputWrap
        icon={<Search size={16} />}
        trailing={
          <button
            type="button"
            className="icon-button"
            aria-label="Add player"
            onClick={() => {
              const player = suggestions[0]
              if (player) addPlayer(player.id)
            }}
            disabled={suggestions.length === 0}
          >
            <Plus size={16} />
          </button>
        }
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
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
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-option-${highlightIndex}` : undefined}
        />
      </FieldInputWrap>

      {open && suggestions.length > 0 ? (
        <div ref={listRef} className="autocomplete-dropdown" id={listId} role="listbox">
          {suggestions.map((player, index) => (
            <div
              key={player.id}
              id={`${listId}-option-${index}`}
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

      {open && query.trim() && suggestions.length === 0 ? (
        <div className="autocomplete-dropdown empty">No players match “{query.trim()}”</div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="selected-player-chips" role="list" aria-label="Selected players">
          {selectedIds.map((playerId) => (
            <span key={playerId} className="player-chip" role="listitem">
              <span>{nameById.get(playerId) ?? 'Unknown'}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${nameById.get(playerId) ?? 'player'}`}
                onClick={() => onRemove(playerId)}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
