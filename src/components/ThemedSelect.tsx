'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type ThemedSelectOption = {
  value: string
  label: string
}

type ThemedSelectProps = {
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
}

type MenuRect = { top: number; left: number; width: number }

export function ThemedSelect({
  value,
  options,
  onChange,
  className = '',
  ariaLabel,
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listboxId = useId()

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : ''

  // The menu renders in a portal on <body>, so it escapes any clipped/scrolling
  // ancestor (e.g. the overflow:hidden pickleball-court). Keep it aligned under
  // the trigger as the page scrolls or resizes.
  useEffect(() => {
    if (!open) return

    function reposition() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setMenuRect({ top: rect.bottom + 6, left: rect.left, width: rect.width })
    }
    reposition()

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [open, selectedIndex])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.focus()
    const node = listRef.current.children[activeIndex] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function commit(index: number) {
    const option = options[index]
    if (option) onChange(option.value)
    setOpen(false)
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(options.length - 1, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(0, index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className={`themed-select ${className}`.trim()} data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className="themed-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
      >
        <span className="themed-select-value">{selectedLabel}</span>
        <ChevronDown size={16} className="themed-select-chevron" aria-hidden />
      </button>

      {open && menuRect
        ? createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              className="themed-select-menu"
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-activedescendant={`${listboxId}-${activeIndex}`}
              onKeyDown={onListKeyDown}
              style={{ top: menuRect.top, left: menuRect.left, minWidth: menuRect.width }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value
                const isActive = index === activeIndex
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`themed-select-option${isActive ? ' active' : ''}${
                      isSelected ? ' selected' : ''
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(index)}
                  >
                    <span className="themed-select-check" aria-hidden>
                      {isSelected ? <Check size={15} /> : null}
                    </span>
                    <span>{option.label}</span>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
