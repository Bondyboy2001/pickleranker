import { formatRating } from '../lib/scoring'
import type { PlayerStanding } from '../lib/types'

export function Podium({
  standings,
  rankByPlayerId,
  onPlayerSelect,
}: {
  standings: PlayerStanding[]
  rankByPlayerId: Map<string, number>
  onPlayerSelect: (playerId: string) => void
}) {
  const topThree = [...standings]
    .sort((a, b) => (rankByPlayerId.get(a.id) ?? 99) - (rankByPlayerId.get(b.id) ?? 99))
    .slice(0, 3)

  if (topThree.length === 0) return null

  const order = [topThree[1], topThree[0], topThree[2]].filter(Boolean)

  return (
    <section className="podium-strip" aria-label="Top three players">
      {order.map((player) => {
        const rank = rankByPlayerId.get(player.id) ?? 0
        return (
          <button
            key={player.id}
            type="button"
            className={`podium-card rank-pos-${rank}`}
            onClick={() => onPlayerSelect(player.id)}
          >
            <span className="podium-rank">#{rank}</span>
            <strong>{player.name}</strong>
            <span className="podium-rating">{formatRating(player.rating)}</span>
            <small>
              {player.wins}-{player.losses} · {player.games} games
            </small>
          </button>
        )
      })}
    </section>
  )
}
