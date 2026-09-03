import { Minus, Plus } from 'lucide-react'

type ScoreInputProps = {
  id?: string
  value: string
  min?: number
  readOnly?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
  onChange: (value: string) => void
}

export function ScoreInput({
  id,
  value,
  min = 0,
  readOnly = false,
  disabled = false,
  ariaLabel,
  className = '',
  onChange,
}: ScoreInputProps) {
  const numericValue = Number(value)
  const currentValue = Number.isFinite(numericValue) ? numericValue : min
  const canStep = !readOnly && !disabled

  function step(delta: number) {
    if (!canStep) return
    onChange(String(Math.max(min, currentValue + delta)))
  }

  return (
    <div className={`score-stepper${readOnly ? ' is-readonly' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="score-stepper-button"
        aria-label={ariaLabel ? `${ariaLabel}: decrease` : 'Decrease score'}
        onClick={() => step(-1)}
        disabled={!canStep || currentValue <= min}
      >
        <Minus size={18} aria-hidden />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="0"
        readOnly={readOnly}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value.replace(/\D/g, '')
          onChange(nextValue)
        }}
      />
      <button
        type="button"
        className="score-stepper-button"
        aria-label={ariaLabel ? `${ariaLabel}: increase` : 'Increase score'}
        onClick={() => step(1)}
        disabled={!canStep}
      >
        <Plus size={18} aria-hidden />
      </button>
    </div>
  )
}
