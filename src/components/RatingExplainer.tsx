import { DEFAULT_RATING } from '../lib/standings'

export function RatingExplainer() {
  return (
    <section className="panel rating-explainer-page">
      <div className="panel-heading">
        <div>
          <h2>How 4DR ratings work</h2>
          <p>
            4DR is the doubles rating used on this leaderboard. Every saved game updates both pairs
            immediately, and the table recalculates from the full match history.
          </p>
        </div>
      </div>

      <div className="rating-explainer-content">
        <section className="explainer-section">
          <h3>Starting point</h3>
          <p>
            New players begin at their entered skill level (for example 3.0). Everyone else carries
            their current 4DR into the next game. The league baseline is{' '}
            <strong>{DEFAULT_RATING.toFixed(3)}</strong> when no other history exists.
          </p>
        </section>

        <section className="explainer-section">
          <h3>What happens after each game</h3>
          <ol className="explainer-steps">
            <li>
              <strong>Team strength is averaged.</strong> Each pair&apos;s rating is the average of
              its two players before the game starts.
            </li>
            <li>
              <strong>Win chance is estimated.</strong> A stronger pair is expected to win more
              often. If both pairs are equal, the expected win chance is 50%.
            </li>
            <li>
              <strong>Winners gain, losers lose.</strong> The upset factor matters: beating a
              stronger pair earns more than beating a weaker one.
            </li>
            <li>
              <strong>Score margin adds a small bonus.</strong> Bigger wins give a little extra;
              losers can claw back a tiny amount from points they still scored.
            </li>
            <li>
              <strong>Both players on a pair move together.</strong> The same rating change is
              applied to each player on that pair for that game.
            </li>
          </ol>
        </section>

        <section className="explainer-section">
          <h3>The maths in plain English</h3>
          <div className="explainer-formula-grid">
            <article className="explainer-card">
              <span className="explainer-card-label">Win chance</span>
              <p>Higher-rated pairs are more likely to win. Equal teams start at 50/50.</p>
            </article>
            <article className="explainer-card">
              <span className="explainer-card-label">Base move</span>
              <p>Upsets earn more. A likely win still moves ratings, just by a smaller amount.</p>
            </article>
            <article className="explainer-card">
              <span className="explainer-card-label">Margin bonus</span>
              <p>An 11-3 result shifts ratings slightly more than an 11-9 result.</p>
            </article>
            <article className="explainer-card">
              <span className="explainer-card-label">Loser points</span>
              <p>Even in defeat, scoring a few points reduces the loss slightly.</p>
            </article>
          </div>
        </section>

        <section className="explainer-section">
          <h3>Example</h3>
          <p>
            Two 3.0 pairs play a game and the score is 11-6. Because the teams looked even before
            the game, the winners gain a moderate amount and the losers lose the mirror amount,
            with a small extra nudge from the five-point margin.
          </p>
          <p>
            If the same winners had beaten a much stronger pair instead, the gain would be larger
            because the result was less expected.
          </p>
        </section>

        <section className="explainer-section">
          <h3>How to read the site</h3>
          <ul className="explainer-list">
            <li>
              <strong>Leaderboard</strong> shows current all-time 4DR, wins, losses, games, and
              point differential.
            </li>
            <li>
              <strong>Weekly</strong> ranks players by how much their 4DR moved during one session,
              not by lifetime rank.
            </li>
            <li>
              <strong>Player chart</strong> opens when you click a name. Hover the line to inspect
              the rating after each week.
            </li>
          </ul>
        </section>

        <section className="explainer-section explainer-note">
          <p>
            Ratings are recalculated from every saved game in order, so editing or deleting a recent
            result will update the whole table.
          </p>
        </section>
      </div>
    </section>
  )
}
