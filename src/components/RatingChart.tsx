import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { DEFAULT_RATING } from '../lib/standings'
import { formatShortWeekLabel, formatWeekLabel } from '../lib/format'
import { formatRating, roundRating } from '../lib/scoring'
import type { PlayerWeekPoint } from '../lib/types'

const CHART_WIDTH = 720
const CHART_HEIGHT = 460
const PADDING_X = 44
const PADDING_TOP = 24
const PADDING_BOTTOM = 40

function buildYTicks(minRating: number, maxRating: number) {
  const span = maxRating - minRating || 0.05
  const step = span <= 0.08 ? 0.02 : span <= 0.2 ? 0.05 : 0.1
  const start = Math.ceil(minRating / step) * step
  const ticks: number[] = []
  for (let value = start; value <= maxRating + step * 0.01; value += step) {
    ticks.push(roundRating(value))
  }
  if (ticks.length === 0) ticks.push(roundRating(minRating), roundRating(maxRating))
  return ticks
}

function getSvgXFromClient(svg: SVGSVGElement, clientX: number) {
  const rect = svg.getBoundingClientRect()
  if (rect.width === 0) return 0
  return ((clientX - rect.left) / rect.width) * CHART_WIDTH
}

function clampChartX(value: number) {
  return Math.min(CHART_WIDTH - PADDING_X, Math.max(PADDING_X, value))
}

type ChartPoint = {
  index: number
  x: number
  y: number
  rating: number
  week: PlayerWeekPoint | null
}

type HoverState = {
  index: number
  x: number
}

export function RatingChart({
  weeks,
  startRating = DEFAULT_RATING,
}: {
  weeks: PlayerWeekPoint[]
  startRating?: number
}) {
  const gradientId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const hoverLineRef = useRef<SVGLineElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const pendingClientXRef = useRef<number | null>(null)
  const hoverStateRef = useRef<HoverState | null>(null)

  const [hoverState, setHoverState] = useState<HoverState | null>(null)
  const [isHovering, setIsHovering] = useState(false)

  const chart = useMemo(() => {
    const ratings = [
      startRating,
      ...weeks.map((week) => roundRating(startRating + week.cumulative)),
    ]
    const pointCount = ratings.length
    const chartWidth = CHART_WIDTH - PADDING_X * 2
    const chartHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM

    const minRating = Math.min(...ratings)
    const maxRating = Math.max(...ratings)
    const range = maxRating - minRating || 0.05
    const padding = range * 0.14
    const domainMin = minRating - padding
    const domainMax = maxRating + padding
    const domainRange = domainMax - domainMin

    const xAt = (index: number) =>
      PADDING_X + (pointCount === 1 ? chartWidth / 2 : (index / (pointCount - 1)) * chartWidth)
    const yAt = (rating: number) =>
      PADDING_TOP + chartHeight - ((rating - domainMin) / domainRange) * chartHeight

    const points: ChartPoint[] = ratings.map((rating, index) => ({
      index,
      x: xAt(index),
      y: yAt(rating),
      rating,
      week: index === 0 ? null : weeks[index - 1] ?? null,
    }))

    const linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' ')
    const floorY = yAt(domainMin)
    const areaPath = `${linePath} L${points.at(-1)!.x.toFixed(1)},${floorY.toFixed(1)} L${points[0].x.toFixed(1)},${floorY.toFixed(1)} Z`
    const baselineY = yAt(startRating)
    const yTicks = buildYTicks(domainMin, domainMax)

    const labelIndexes = new Set<number>([0])
    const step = Math.max(2, Math.ceil(weeks.length / 6))
    for (let index = step; index < weeks.length; index += step) labelIndexes.add(index + 1)
    labelIndexes.add(pointCount - 1)

    return {
      points,
      linePath,
      areaPath,
      baselineY,
      yTicks,
      labelIndexes,
      yAt,
    }
  }, [weeks, startRating])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  function syncHover(clientX: number) {
    const svg = svgRef.current
    if (!svg) return

    const svgX = clampChartX(getSvgXFromClient(svg, clientX))
    hoverLineRef.current?.setAttribute('x1', svgX.toFixed(1))
    hoverLineRef.current?.setAttribute('x2', svgX.toFixed(1))
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${(svgX / CHART_WIDTH) * 100}%`
    }

    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    chart.points.forEach((point) => {
      const distance = Math.abs(point.x - svgX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = point.index
      }
    })

    const current = hoverStateRef.current
    if (!current || current.index !== nearest || Math.abs(current.x - svgX) > 0.5) {
      const nextState = { index: nearest, x: svgX }
      hoverStateRef.current = nextState
      setHoverState(nextState)
    }
  }

  function scheduleHover(clientX: number) {
    pendingClientXRef.current = clientX
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      if (pendingClientXRef.current === null) return
      syncHover(pendingClientXRef.current)
    })
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isHovering) setIsHovering(true)
    scheduleHover(event.clientX)
  }

  function handlePointerLeave() {
    pendingClientXRef.current = null
    hoverStateRef.current = null
    setHoverState(null)
    setIsHovering(false)
  }

  function handleChartKeyDown(event: React.KeyboardEvent) {
    if (chart.points.length === 0) return
    const current = hoverState?.index ?? chart.points.length - 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      const next = Math.min(chart.points.length - 1, current + 1)
      const point = chart.points[next]
      hoverStateRef.current = { index: next, x: point.x }
      setHoverState({ index: next, x: point.x })
      setIsHovering(true)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.max(0, current - 1)
      const point = chart.points[next]
      hoverStateRef.current = { index: next, x: point.x }
      setHoverState({ index: next, x: point.x })
      setIsHovering(true)
    } else if (event.key === 'Home') {
      event.preventDefault()
      const point = chart.points[0]
      hoverStateRef.current = { index: 0, x: point.x }
      setHoverState({ index: 0, x: point.x })
      setIsHovering(true)
    } else if (event.key === 'End') {
      event.preventDefault()
      const last = chart.points.length - 1
      const point = chart.points[last]
      hoverStateRef.current = { index: last, x: point.x }
      setHoverState({ index: last, x: point.x })
      setIsHovering(true)
    }
  }

  if (weeks.length === 0) {
    return <div className="empty-chart">No sessions logged yet.</div>
  }

  const activeIndex = hoverState?.index ?? chart.points.length - 1
  const activePoint = chart.points[activeIndex]
  const activeWeek = activePoint.week
  const isStart = activeIndex === 0
  const initialHoverX = hoverState?.x ?? activePoint.x
  const initialHoverLeft = `${(initialHoverX / CHART_WIDTH) * 100}%`

  return (
    <div className="chart-card">
      <div className="chart-title">
        <span>4DR rating over time</span>
        <strong>{weeks.length} sessions</strong>
      </div>

      <div className="chart-hover-summary" aria-live="polite" aria-atomic="true">
        <div>
          <span className="chart-hover-label">
            {isStart ? 'Starting rating' : formatWeekLabel(activeWeek?.label ?? '')}
          </span>
          <small className={isStart || !activeWeek ? 'chart-placeholder' : undefined}>
            {!isStart && activeWeek
              ? `${activeWeek.wins}-${activeWeek.losses} | ${activeWeek.games} game${
                  activeWeek.games === 1 ? '' : 's'
                }`
              : '0-0 | 0 games'}
          </small>
        </div>
        <div className="chart-hover-values">
          <strong className="chart-hover-rating">{formatRating(activePoint.rating)}</strong>
          <span
            className={
              isStart || !activeWeek
                ? 'chart-hover-change chart-placeholder'
                : activeWeek.change >= 0
                  ? 'chart-hover-change positive'
                  : 'chart-hover-change negative'
            }
          >
            {!isStart && activeWeek
              ? `${activeWeek.change >= 0 ? '+' : ''}${activeWeek.change.toFixed(3)} week`
              : '+0.000 week'}
          </span>
        </div>
      </div>

      <div
        className="chart-wrap"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        tabIndex={0}
        role="slider"
        aria-label="4DR rating over time. Use left and right arrows to review weekly ratings."
        aria-valuemin={0}
        aria-valuemax={chart.points.length - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={`${isStart ? 'Starting rating' : formatWeekLabel(activeWeek?.label ?? '')}: ${formatRating(activePoint.rating)}`}
        onKeyDown={handleChartKeyDown}
      >
        {isHovering ? (
          <div
            ref={tooltipRef}
            className="chart-tooltip"
            style={{ left: initialHoverLeft }}
            aria-hidden="true"
          >
            <span className="chart-tooltip-rating">{formatRating(activePoint.rating)}</span>
            <span className="chart-tooltip-label">
              {isStart ? 'Start' : formatShortWeekLabel(activeWeek?.label ?? '')}
            </span>
          </div>
        ) : null}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="rating-chart-svg"
          role="img"
          aria-label="4DR rating over time. Move across the chart to review weekly ratings."
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-strong)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent-strong)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {chart.yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING_X}
                x2={CHART_WIDTH - PADDING_X}
                y1={chart.yAt(tick)}
                y2={chart.yAt(tick)}
                className="chart-grid-line"
              />
            </g>
          ))}

          <line
            x1={PADDING_X}
            x2={CHART_WIDTH - PADDING_X}
            y1={chart.baselineY}
            y2={chart.baselineY}
            className="chart-zero"
          />

          <path d={chart.areaPath} fill={`url(#${gradientId})`} />
          <path d={chart.linePath} className="chart-line" />

          {isHovering ? (
            <line
              ref={hoverLineRef}
              x1={initialHoverX}
              x2={initialHoverX}
              y1={PADDING_TOP}
              y2={CHART_HEIGHT - PADDING_BOTTOM}
              className="chart-hover-line"
            />
          ) : null}

          {chart.points.map((point) => {
            const weekChange = point.week?.change ?? 0
            const isActive = point.index === activeIndex
            let dotClass = 'chart-dot'
            if (point.index === 0) dotClass += ' chart-dot-start'
            else if (weekChange >= 0) dotClass += ' positive'
            else dotClass += ' negative'
            if (isActive) dotClass += ' active'

            return (
              <g key={point.index}>
                {isActive ? (
                  <circle cx={point.x} cy={point.y} r={13} className="chart-dot-ring" />
                ) : null}
                <circle cx={point.x} cy={point.y} r={isActive ? 8 : 5.8} className={dotClass} />
              </g>
            )
          })}

          {[...chart.labelIndexes].map((index) => {
            const label =
              index === 0 ? 'Start' : formatShortWeekLabel(weeks[index - 1]?.label ?? '')
            return (
              <text
                key={index}
                x={chart.points[index]?.x.toFixed(1)}
                y={CHART_HEIGHT - 10}
                className="chart-label"
                textAnchor="middle"
              >
                {label}
              </text>
            )
          })}

          <rect
            x={0}
            y={0}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            fill="transparent"
            className="chart-hit-area"
          />
        </svg>

        <details className="chart-data-table">
          <summary>View ratings as a table</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Start</th>
                  <td>{formatRating(startRating)}</td>
                  <td>—</td>
                </tr>
                {weeks.map((week, index) => (
                  <tr key={week.key}>
                    <th scope="row">{formatWeekLabel(week.label)}</th>
                    <td>{formatRating(roundRating(startRating + weeks.slice(0, index + 1).reduce((t, w) => t + w.change, 0)))}</td>
                    <td>{`${week.change >= 0 ? '+' : ''}${week.change.toFixed(3)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  )
}
