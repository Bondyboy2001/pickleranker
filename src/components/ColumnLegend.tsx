export function ColumnLegend() {
  return (
    <p className="column-legend">
      <abbr title="Doubles rating — updates after every game">4DR</abbr> = doubles rating ·{' '}
      <abbr title="Points scored minus points conceded across all games">Point</abbr> = point
      difference · Weekly <abbr title="Win-loss record difference">Diff</abbr> = wins minus losses
    </p>
  )
}
