import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { FieldInputWrap } from './AdminField'
import type { Player } from '../lib/types'

type PlayerAutocompleteProps = {
  players: Player[]
  value: string
  onChange: (playerId: string) => void
  excludeIds?: string[]
  placeholder?: string
}

export function PlayerAutocomplete({
  players,
  value,
  onChange,
  excludeIds = [],
  placeholder = 'Type player name...',
}: PlayerAutocompleteProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [draftQuery, setDraftQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const selectedName = useMemo(
    () => players.find((player) => player.id === value)?.name ?? '',
    [players, value],
  )
  const query = draftQuery ?? selectedName

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return players
      .filter(
        (player) =>
          (player.id === value || !excludeIds.includes(player.id)) &&
          (normalizedQuery === '' || player.name.toLowerCase().includes(normalizedQuery)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [players, value, excludeIds, query])

  function selectPlayer(playerId: string) {
    onChange(playerId)
    setDraftQuery(null)
    setOpen(false)
    setHighlightIndex(0)
  }

  function resetDraft() {
    setDraftQuery(null)
    setOpen(false)
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
      if (player) selectPlayer(player.id)
      return
    }
    if (event.key === 'Escape') {
      resetDraft()
    }
  }

  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      const target = event.target as Node
      if (!inputRef.current?.contains(target) && !listRef.current?.contains(target)) {
        resetDraft()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="player-autocomplete">
      <FieldInputWrap icon={<Search size={16} />}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value
            setDraftQuery(nextQuery)
            setOpen(true)
            setHighlightIndex(0)
            if (!nextQuery.trim()) onChange('')
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
              onClick={() => selectPlayer(player.id)}
            >
              {player.name}
            </div>
          ))}
        </div>
      ) : null}

      {open && query.trim() && suggestions.length === 0 ? (
        <div className="autocomplete-dropdown empty">No players match “{query.trim()}”</div>
      ) : null}
    </div>
  )
}
