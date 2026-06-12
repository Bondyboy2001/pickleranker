import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'

export function RatingExplainer() {
  const [open, setOpen] = useState(false)

  return (
    <section className="panel rating-explainer">
      <button
        type="button"
        className="rating-explainer-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="rating-explainer-label">
          <Info size={18} />
          How 4DR ratings work
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? (
        <div className="rating-explainer-body">
          <p>
            <strong>4DR</strong> is a doubles rating for this league. Each player starts from their
            skill level (for example 3.0) and moves up or down after every game.
          </p>
          <ul>
            <li>
              <strong>Winners gain</strong> points based on how unlikely the win was — beating a
              stronger pair earns more.
            </li>
            <li>
              <strong>Losers lose</strong> the mirror amount, but can claw back a little from the
              score margin.
            </li>
            <li>
              <strong>Weekly view</strong> shows how much each player moved during that session,
              not their all-time rank.
            </li>
          </ul>
          <p className="rating-explainer-foot">
            Rankings update after every saved game. Tap a player on the leaderboard to see their
            rating chart and recent weeks.
          </p>
        </div>
      ) : null}
    </section>
  )
}
