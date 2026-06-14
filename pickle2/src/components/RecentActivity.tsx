import { formatPlayedOnDate } from '../lib/data'
import type { Match } from '../lib/types'

export function RecentActivity({
  matches,
  playerNameById,
  limit = 5,
}: {
  matches: Match[]
  playerNameById: Map<string, string>
  limit?: number
}) {
  const recent = matches.slice(0, limit)
  if (recent.length === 0) return null

  return (
    <section className="panel recent-activity-panel" aria-label="Latest games">
      <div className="panel-heading">
        <div>
          <h2>Latest games</h2>
          <p>Most recently saved results</p>
        </div>
      </div>
      <ul className="recent-activity-list">
        {recent.map((match) => (
          <li key={match.id}>
            <span className="recent-activity-date">{formatPlayedOnDate(match.playedOn)}</span>
            <span className="recent-activity-matchup">
              {playerNameById.get(match.teamA[0]) ?? '?'} &amp;{' '}
              {playerNameById.get(match.teamA[1]) ?? '?'}
              <span className="recent-activity-score">
                {match.scoreA}-{match.scoreB}
              </span>
              {playerNameById.get(match.teamB[0]) ?? '?'} &amp;{' '}
              {playerNameById.get(match.teamB[1]) ?? '?'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
