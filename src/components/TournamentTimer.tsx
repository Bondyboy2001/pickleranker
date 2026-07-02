import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'

const DEFAULT_TIMER_MINUTES = 12
const MIN_TIMER_MINUTES = 1
const MAX_TIMER_MINUTES = 60

function durationInputToSeconds(value: string) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return DEFAULT_TIMER_MINUTES * 60
  return Math.round(Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, minutes))) * 60
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function TournamentTimer() {
  const defaultSeconds = DEFAULT_TIMER_MINUTES * 60
  const pauseButtonRef = useRef<HTMLButtonElement>(null)
  const [durationInput, setDurationInput] = useState(String(DEFAULT_TIMER_MINUTES))
  const [remainingSeconds, setRemainingSeconds] = useState(defaultSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!isRunning || !endsAt) return
    const tick = () => {
      const nextRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setRemainingSeconds(nextRemaining)
      if (nextRemaining === 0) {
        setIsRunning(false)
        setEndsAt(null)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 1000)
    return () => window.clearInterval(intervalId)
  }, [endsAt, isRunning])

  useEffect(() => {
    if (!isFullscreen) return
    pauseButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen])

  function updateDuration(value: string) {
    if (hasStarted) return
    setDurationInput(value)
    if (value.trim() === '') return
    setRemainingSeconds(durationInputToSeconds(value))
  }

  function commitDuration() {
    const seconds = durationInputToSeconds(durationInput)
    setDurationInput(String(seconds / 60))
    if (!hasStarted) setRemainingSeconds(seconds)
  }

  function stepMinutes(delta: number) {
    if (hasStarted) return
    const current = Math.round(durationInputToSeconds(durationInput) / 60)
    const next = Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, current + delta))
    setDurationInput(String(next))
    setRemainingSeconds(next * 60)
  }

  function startTimer() {
    if (remainingSeconds <= 0) return
    setHasStarted(true)
    setIsRunning(true)
    setIsFullscreen(true)
    setEndsAt(Date.now() + remainingSeconds * 1000)
  }

  function pauseTimer() {
    if (endsAt) {
      setRemainingSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }
    setIsRunning(false)
    setEndsAt(null)
  }

  function resetTimer() {
    const seconds = durationInputToSeconds(durationInput)
    setIsRunning(false)
    setHasStarted(false)
    setIsFullscreen(false)
    setEndsAt(null)
    setRemainingSeconds(seconds)
  }

  const isTimeUp = hasStarted && remainingSeconds === 0
  const totalSeconds = Math.max(1, durationInputToSeconds(durationInput))
  const progress = Math.min(1, Math.max(0, remainingSeconds / totalSeconds))
  const progressAngle = `${progress * 360}deg`
  const timerStatus = isTimeUp ? "Time's up" : isRunning ? 'Counting down' : hasStarted ? 'Paused' : 'Ready'
  const formattedRemaining = useMemo(() => formatTimer(remainingSeconds), [remainingSeconds])

  return (
    <>
      <section
        className={`tournament-timer${isRunning ? ' running' : ''}${isTimeUp ? ' done' : ''}`}
        style={{ ['--timer-progress' as string]: progress }}
      >
        <div className="tournament-timer-display">
          <span className="tournament-timer-icon" aria-hidden>
            <Clock size={20} />
          </span>
          <div className="tournament-timer-readout">
            <span className="tournament-timer-label">Round timer</span>
            <strong>{formattedRemaining}</strong>
            <span className="tournament-timer-status">{timerStatus}</span>
          </div>
        </div>

        <div className="tournament-timer-controls">
          <div className="tournament-timer-minutes">
            <span className="tournament-timer-minutes-label">Minutes</span>
            <div className="tournament-timer-stepper">
              <button
                type="button"
                className="tournament-timer-step"
                onClick={() => stepMinutes(-1)}
                disabled={hasStarted || Math.round(totalSeconds / 60) <= MIN_TIMER_MINUTES}
                aria-label="Decrease minutes"
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                className="tournament-timer-minutes-input"
                min={MIN_TIMER_MINUTES}
                max={MAX_TIMER_MINUTES}
                step="1"
                value={durationInput}
                onChange={(event) => updateDuration(event.target.value)}
                onBlur={commitDuration}
                disabled={hasStarted}
                aria-label="Timer duration in minutes"
              />
              <button
                type="button"
                className="tournament-timer-step"
                onClick={() => stepMinutes(1)}
                disabled={hasStarted || Math.round(totalSeconds / 60) >= MAX_TIMER_MINUTES}
                aria-label="Increase minutes"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="tournament-timer-actions">
            <button
              type="button"
              className="primary-button tournament-timer-button"
              onClick={isRunning ? pauseTimer : startTimer}
              disabled={remainingSeconds <= 0}
            >
              {isRunning ? <Pause size={16} /> : <Play size={16} />}
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button type="button" className="ghost-button tournament-timer-button" onClick={resetTimer}>
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </div>

        <span className="tournament-timer-track" aria-hidden>
          <span className="tournament-timer-fill" />
        </span>
      </section>

      {isFullscreen ? (
        <div
          className={`timer-fullscreen${isRunning ? ' running' : ''}${isTimeUp ? ' done' : ''}`}
          style={{ ['--timer-angle' as string]: progressAngle }}
          role="dialog"
          aria-modal="true"
          aria-label="Round timer"
        >
          <button
            type="button"
            className="timer-fullscreen-close"
            onClick={() => setIsFullscreen(false)}
            aria-label="Exit full-screen timer"
          >
            <X size={24} />
          </button>
          <div className="timer-fullscreen-content">
            <span className="timer-fullscreen-label">Round timer</span>
            <div className="timer-fullscreen-ring" aria-hidden>
              <div className="timer-fullscreen-face">
                <strong>{formattedRemaining}</strong>
                <span>{timerStatus}</span>
              </div>
            </div>
            <div className="timer-fullscreen-actions">
              <button
                ref={pauseButtonRef}
                type="button"
                className="primary-button tournament-timer-button"
                onClick={isRunning ? pauseTimer : startTimer}
                disabled={remainingSeconds <= 0}
              >
                {isRunning ? <Pause size={18} /> : <Play size={18} />}
                {isRunning ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="ghost-button tournament-timer-button" onClick={resetTimer}>
                <RotateCcw size={18} />
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
