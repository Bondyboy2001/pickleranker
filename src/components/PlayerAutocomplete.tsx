import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { FieldInputWrap } from './AdminField'
import type { Player } from '../lib/types'

type AutocompletePlayer = Pick<Player, 'id' | 'name'>

type PlayerAutocompleteProps = {
  players: AutocompletePlayer[]
  value: string
  onChange: (playerId: string) => void
  excludeIds?: string[]
  placeholder?: string
}

type PlayerSearchAutocompleteProps = {
  players: AutocompletePlayer[]
  value: string
  onChange: (query: string) => void
  onSelect?: (playerId: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
}

function useHighlightNavigation(suggestionCount: number) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)

  function moveHighlight(direction: 1 | -1) {
    setOpen(true)
    setHighlightIndex((index) =>
      direction === 1
        ? Math.min(index + 1, Math.max(suggestionCount - 1, 0))
        : Math.max(index - 1, 0),
    )
  }

  function resetHighlight() {
    setHighlightIndex(0)
  }

  return { open, setOpen, highlightIndex, setHighlightIndex, moveHighlight, resetHighlight }
}

function useDismissOnOutsideClick(
  open: boolean,
  onDismiss: () => void,
  inputRef: React.RefObject<HTMLElement | null>,
  listRef: React.RefObject<HTMLElement | null>,
) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      const target = event.target as Node
      if (!inputRef.current?.contains(target) && !listRef.current?.contains(target)) {
        onDismissRef.current()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, inputRef, listRef])
}

function filterPlayersByQuery(players: AutocompletePlayer[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return players
    .filter(
      (player) =>
        normalizedQuery === '' || player.name.toLowerCase().includes(normalizedQuery),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
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
  const { open, setOpen, highlightIndex, setHighlightIndex, moveHighlight, resetHighlight } =
    useHighlightNavigation(suggestions.length)

  function selectPlayer(playerId: string) {
    onChange(playerId)
    setDraftQuery(null)
    setOpen(false)
    resetHighlight()
  }

  function resetDraft() {
    setDraftQuery(null)
    setOpen(false)
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
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

  useDismissOnOutsideClick(open, resetDraft, inputRef, listRef)

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
          role="combobox"
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

export function PlayerSearchAutocomplete({
  players,
  value,
  onChange,
  onSelect,
  placeholder = 'Search players...',
  ariaLabel = 'Search players',
  className = '',
}: PlayerSearchAutocompleteProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => filterPlayersByQuery(players, value), [players, value])
  const { open, setOpen, highlightIndex, setHighlightIndex, moveHighlight, resetHighlight } =
    useHighlightNavigation(suggestions.length)

  function selectPlayer(player: AutocompletePlayer) {
    onChange(player.name)
    onSelect?.(player.id)
    setOpen(false)
    resetHighlight()
  }

  function dismiss() {
    setOpen(false)
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(-1)
      return
    }
    if (event.key === 'Enter') {
      const player = suggestions[highlightIndex]
      if (!player) return
      event.preventDefault()
      selectPlayer(player)
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  useDismissOnOutsideClick(open, dismiss, inputRef, listRef)

  return (
    <div className={`player-autocomplete ${className}`.trim()}>
      <FieldInputWrap icon={<Search size={16} />}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setHighlightIndex(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          role="combobox"
          aria-label={ariaLabel}
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
              onClick={() => selectPlayer(player)}
            >
              {player.name}
            </div>
          ))}
        </div>
      ) : null}

      {open && value.trim() && suggestions.length === 0 ? (
        <div className="autocomplete-dropdown empty">No players match “{value.trim()}”</div>
      ) : null}
    </div>
  )
}
