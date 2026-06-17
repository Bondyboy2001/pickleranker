import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  id?: string
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toISO(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function parseISO(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  }
}

function formatDisplay(value: string): string {
  const parsed = parseISO(value)
  if (!parsed) return ''
  return `${parsed.day} ${MONTHS[parsed.month]} ${parsed.year}`
}

// Monday-first index for a Date's day of week.
function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7
}

export function DatePicker({ value, onChange, required, id }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  // The day (in the visible month) that owns the roving tabindex / keyboard focus.
  const [focusDay, setFocusDay] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const today = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
  }, [])

  const selected = parseISO(value)

  // The month currently shown in the calendar grid.
  const [viewYear, setViewYear] = useState(selected?.year ?? today.year)
  const [viewMonth, setViewMonth] = useState(selected?.month ?? today.month)

  // Keep the visible month in sync when the value changes from outside.
  useEffect(() => {
    const parsed = parseISO(value)
    if (parsed) {
      setViewYear(parsed.year)
      setViewMonth(parsed.month)
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Drop the keyboard focus target whenever the popover closes.
  useEffect(() => {
    if (!open) setFocusDay(null)
  }, [open])

  // Move DOM focus to whichever day currently owns the roving tabindex.
  useEffect(() => {
    if (!open || focusDay == null) return
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)
      ?.focus()
  }, [open, focusDay, viewYear, viewMonth])

  const goMonth = useCallback((delta: number) => {
    setViewMonth((prevMonth) => {
      const next = prevMonth + delta
      if (next < 0) {
        setViewYear((y) => y - 1)
        return 11
      }
      if (next > 11) {
        setViewYear((y) => y + 1)
        return 0
      }
      return next
    })
  }, [])

  const goToday = useCallback(() => {
    onChange(toISO(today.year, today.month, today.day))
    setOpen(false)
  }, [onChange, today])

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1)
    const leadingBlanks = mondayIndex(firstOfMonth)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const result: (number | null)[] = []
    for (let i = 0; i < leadingBlanks; i += 1) result.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) result.push(day)
    while (result.length % 7 !== 0) result.push(null)
    return result
  }, [viewYear, viewMonth])

  const handleSelect = useCallback(
    (day: number) => {
      onChange(toISO(viewYear, viewMonth, day))
      setOpen(false)
    },
    [onChange, viewYear, viewMonth],
  )

  function openPicker() {
    const initial =
      selected && selected.year === viewYear && selected.month === viewMonth
        ? selected.day
        : today.year === viewYear && today.month === viewMonth
          ? today.day
          : 1
    setFocusDay(initial)
    setOpen(true)
  }

  // Arrow / Home / End / PageUp / PageDown navigation across the calendar grid.
  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (focusDay == null) return
    const cursor = new Date(viewYear, viewMonth, focusDay)
    switch (event.key) {
      case 'ArrowLeft':
        cursor.setDate(cursor.getDate() - 1)
        break
      case 'ArrowRight':
        cursor.setDate(cursor.getDate() + 1)
        break
      case 'ArrowUp':
        cursor.setDate(cursor.getDate() - 7)
        break
      case 'ArrowDown':
        cursor.setDate(cursor.getDate() + 7)
        break
      case 'Home':
        cursor.setDate(cursor.getDate() - mondayIndex(cursor))
        break
      case 'End':
        cursor.setDate(cursor.getDate() + (6 - mondayIndex(cursor)))
        break
      case 'PageUp':
        cursor.setMonth(cursor.getMonth() - 1)
        break
      case 'PageDown':
        cursor.setMonth(cursor.getMonth() + 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        handleSelect(focusDay)
        return
      default:
        return
    }
    event.preventDefault()
    setViewYear(cursor.getFullYear())
    setViewMonth(cursor.getMonth())
    setFocusDay(cursor.getDate())
  }

  return (
    <div className="date-picker" ref={containerRef}>
      <button
        type="button"
        id={id}
        className={`field-input-wrap date-picker-trigger${value ? '' : ' is-empty'}`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Calendar size={17} aria-hidden />
        <span className="date-picker-value">
          {value ? formatDisplay(value) : 'Select date'}
        </span>
      </button>
      {required ? (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          className="date-picker-validation"
        />
      ) : null}

      {open ? (
        <div className="date-picker-popover" role="dialog" aria-label="Choose date">
          <div className="date-picker-header">
            <span className="date-picker-title">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <div className="date-picker-nav">
              <button type="button" onClick={() => goMonth(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={goToday} aria-label="Select today" title="Today">
                <span className="date-picker-today-dot" />
              </button>
              <button type="button" onClick={() => goMonth(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="date-picker-weekdays">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="date-picker-grid" ref={gridRef} onKeyDown={handleGridKeyDown}>
            {cells.map((day, index) => {
              if (day === null) {
                return <span key={`blank-${index}`} className="date-picker-blank" />
              }
              const isSelected =
                selected?.year === viewYear &&
                selected?.month === viewMonth &&
                selected?.day === day
              const isToday =
                today.year === viewYear && today.month === viewMonth && today.day === day
              const classes = ['date-picker-day']
              if (isSelected) classes.push('is-selected')
              if (isToday) classes.push('is-today')
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  tabIndex={day === focusDay ? 0 : -1}
                  className={classes.join(' ')}
                  onClick={() => handleSelect(day)}
                  aria-pressed={isSelected}
                  aria-label={`${day} ${MONTHS[viewMonth]} ${viewYear}`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
