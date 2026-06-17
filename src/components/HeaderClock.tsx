'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    let timerId = 0
    // Only the minute is shown, so tick on minute boundaries instead of every
    // second — one re-render a minute, aligned to the wall clock.
    const schedule = () => {
      const current = new Date()
      setNow(current)
      const msToNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds())
      timerId = window.setTimeout(schedule, msToNextMinute)
    }
    schedule()
    return () => window.clearTimeout(timerId)
  }, [])

  // Render nothing until mounted to avoid a server/client hydration mismatch.
  if (!now) return null

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <span className="header-clock" suppressHydrationWarning>
      <Clock size={24} aria-hidden />
      <span className="header-clock-text">
        <strong>{time}</strong>
        <small>{date}</small>
      </span>
    </span>
  )
}
