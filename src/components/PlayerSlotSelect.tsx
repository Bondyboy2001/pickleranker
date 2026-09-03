'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { ThemedSelectOption } from './ThemedSelect'

type Rect = { top: number; left: number; width: number }

// A type-to-search player picker for a single court seat. You can clear the
// field and type a name to filter, then pick a match. The dropdown renders in a
// portal (so the clipped court card doesn't hide it) and is positioned once on
// open + on resize — it does NOT chase the page scroll, so it stays put.
export function PlayerSlotSelect({
  value,
  options,
  onChange,
  placeholder = '',
  className = '',
  ariaLabel,
}: {
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()

  const currentLabel = options.find((option) => option.value === value)?.label ?? ''
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter((option) => option.label.toLowerCase().includes(q))
    : options

  useEffect(() => {
    if (!open) return
    function position() {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 6 + window.scrollY, left: r.left + window.scrollX, width: r.width })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  function openMenu() {
    setOpen(true)
    setQuery('')
    setActive(0)
  }

  function select(option: ThemedSelectOption) {
    onChange(option.value)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => Math.min(filtered.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (filtered[active]) select(filtered[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={wrapRef} className={`player-slot-combobox ${className}`.trim()} data-open={open}>
      <input
        ref={inputRef}
        type="text"
        className="player-slot-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel ?? placeholder ?? 'Select player'}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={open ? query : currentLabel}
        onFocus={openMenu}
        onChange={(event) => {
          setOpen(true)
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && rect
        ? createPortal(
            <ul
              id={listboxId}
              className="themed-select-menu"
              role="listbox"
              style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
            >
              {filtered.length === 0 ? (
                <li className="themed-select-option empty-result">No players match “{query}”.</li>
              ) : (
                filtered.map((option, index) => (
                  <li
                    key={option.value}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={option.value === value}
                    className={`themed-select-option${index === active ? ' active' : ''}${
                      option.value === value ? ' selected' : ''
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => select(option)}
                  >
                    <span className="themed-select-check" aria-hidden>
                      {option.value === value ? <Check size={15} /> : null}
                    </span>
                    <span>{option.label}</span>
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
