import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { DEFAULT_RATING } from '../lib/standings'
import { formatRating, roundRating } from '../lib/scoring'
import type { PlayerWeekPoint } from '../lib/types'

const CHART_WIDTH = 720
const CHART_HEIGHT = 300
const PADDING_X = 44
const PADDING_TOP = 24
const PADDING_BOTTOM = 40

function formatWeekLabel(label: string) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const match = label.match(/(\d{1,2})-(\d{2})-(\d{4})/)
  if (!match) return label
  return `${parseInt(match[1], 10)} ${months[parseInt(match[2], 10) - 1]} ${match[3]}`
}

function formatShortWeekLabel(label: string) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const match = label.match(/(\d{1,2})-(\d{2})-(\d{4})/)
  if (!match) return label.slice(0, 6)
  return `${parseInt(match[1], 10)} ${months[parseInt(match[2], 10) - 1]}`
}

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
  const inverse = svg.getScreenCTM()?.inverse()
  if (!inverse) return 0
  return new DOMPoint(clientX, 0).matrixTransform(inverse).x
}

function getClientXFromSvg(svg: SVGSVGElement, svgX: number) {
  const matrix = svg.getScreenCTM()
  if (!matrix) return 0
  return new DOMPoint(svgX, 0).matrixTransform(matrix).x
}

type ChartPoint = {
  index: number
  x: number
  y: number
  rating: number
  week: PlayerWeekPoint | null
}

export function RatingChart({
  weeks,
  currentRating,
  startRating = DEFAULT_RATING,
}: {
  weeks: PlayerWeekPoint[]
  currentRating: number
  startRating?: number
}) {
  const gradientId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const frameRef = useRef<number | null>(null)
  const pendingClientXRef = useRef<number | null>(null)
  const hoveredIndexRef = useRef<number | null>(null)

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipLeft, setTooltipLeft] = useState(0)

  const chart = useMemo(() => {
    const ratings = [
      startRating,
      ...weeks.map((week) => roundRating(startRating + week.cumulative)),
    ]
    const currentChartRating = ratings.at(-1) ?? currentRating
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
      currentChartRating,
      yAt,
      plotWidth: chartWidth,
      plotHeight: chartHeight,
    }
  }, [weeks, currentRating, startRating])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  function syncHover(clientX: number) {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap) return

    const svgX = getSvgXFromClient(svg, clientX)
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    chart.points.forEach((point) => {
      const distance = Math.abs(point.x - svgX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = point.index
      }
    })

    const point = chart.points[nearest]
    const wrapRect = wrap.getBoundingClientRect()
    const nextTooltipLeft = getClientXFromSvg(svg, point.x) - wrapRect.left

    if (hoveredIndexRef.current !== nearest) {
      hoveredIndexRef.current = nearest
      setHoveredIndex(nearest)
    }
    setTooltipLeft(nextTooltipLeft)
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

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    scheduleHover(event.clientX)
  }

  function handlePointerLeave() {
    pendingClientXRef.current = null
    hoveredIndexRef.current = null
    setHoveredIndex(null)
  }

  useEffect(() => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap || chart.points.length === 0) return

    const lastPoint = chart.points[chart.points.length - 1]
    const wrapRect = wrap.getBoundingClientRect()
    setTooltipLeft(getClientXFromSvg(svg, lastPoint.x) - wrapRect.left)
  }, [chart.points, weeks])

  if (weeks.length === 0) {
    return <div className="empty-chart">No sessions logged yet.</div>
  }

  const activeIndex = hoveredIndex ?? chart.points.length - 1
  const activePoint = chart.points[activeIndex]
  const activeWeek = activePoint.week
  const isStart = activeIndex === 0
  const isHovering = hoveredIndex !== null

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
          {!isStart && activeWeek ? (
            <small>
              {activeWeek.wins}-{activeWeek.losses} | {activeWeek.games} game
              {activeWeek.games === 1 ? '' : 's'}
            </small>
          ) : null}
        </div>
        <div className="chart-hover-values">
          <strong className="chart-hover-rating">{formatRating(activePoint.rating)}</strong>
          {!isStart && activeWeek ? (
            <span
              className={
                activeWeek.change >= 0 ? 'chart-hover-change positive' : 'chart-hover-change negative'
              }
            >
              {activeWeek.change >= 0 ? '+' : ''}
              {activeWeek.change.toFixed(3)} week
            </span>
          ) : null}
        </div>
      </div>

      <div className="chart-wrap" ref={wrapRef}>
        {isHovering ? (
          <div
            className="chart-tooltip"
            style={{ left: `${tooltipLeft}px` }}
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
          aria-label="4DR rating over time. Move pointer over chart to inspect weekly ratings."
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
              <text
                x={PADDING_X - 10}
                y={chart.yAt(tick) + 4}
                className="chart-y-label"
                textAnchor="end"
              >
                {tick.toFixed(2)}
              </text>
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
              x1={activePoint.x}
              x2={activePoint.x}
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
                  <circle cx={point.x} cy={point.y} r={10} className="chart-dot-ring" />
                ) : null}
                <circle cx={point.x} cy={point.y} r={isActive ? 6 : 4.5} className={dotClass} />
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
            x={PADDING_X}
            y={PADDING_TOP}
            width={chart.plotWidth}
            height={chart.plotHeight}
            fill="transparent"
            className="chart-hit-area"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          />
        </svg>

        {!isHovering ? (
          <p className="chart-hint">Move over the chart to inspect weekly ratings</p>
        ) : null}
      </div>

      <div className="chart-scale">
        <span>Start {formatRating(startRating)}</span>
        <span>Now {formatRating(chart.currentChartRating)}</span>
      </div>
    </div>
  )
}
