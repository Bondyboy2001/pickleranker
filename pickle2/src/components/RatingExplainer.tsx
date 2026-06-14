import { DEFAULT_RATING } from '../lib/standings'

export function RatingExplainer() {
  const equalTeamBaseMove = 0.1 * (1 - 0.5)
  const exampleMarginBonus = (11 - 6) * 0.001
  const exampleLoserCredit = 6 * 0.001
  const exampleWinnerMove = equalTeamBaseMove + exampleMarginBonus
  const exampleLoserMove = -equalTeamBaseMove + exampleLoserCredit

  return (
    <section className="panel rating-explainer-page">
      <div className="rating-explainer-hero">
        <div>
          <span className="eyebrow">Rating guide</span>
          <h2>How 4DR ratings work</h2>
          <p>
            4DR is a doubles rating. It updates after every saved game using the two team ratings,
            who won, and the final score. Higher numbers mean stronger recent results.
          </p>
        </div>
        <div className="rating-explainer-baseline">
          <span>Default start</span>
          <strong>{DEFAULT_RATING.toFixed(3)}</strong>
        </div>
      </div>

      <div className="rating-explainer-content">
        <section className="explainer-section explainer-overview-grid">
          <article className="explainer-feature-card">
            <span>1</span>
            <h3>Team rating</h3>
            <p>Before each game, the two players on a side are averaged into one team rating.</p>
          </article>
          <article className="explainer-feature-card">
            <span>2</span>
            <h3>Expected result</h3>
            <p>The stronger team is expected to win. Upsets move ratings more than expected wins.</p>
          </article>
          <article className="explainer-feature-card">
            <span>3</span>
            <h3>Score impact</h3>
            <p>Winning by more adds a small bonus. Losing while scoring points softens the drop.</p>
          </article>
        </section>

        <section className="explainer-section explainer-panel">
          <div>
            <h3>Starting point</h3>
            <p>
              A player starts from their entered skill level. If no starting value exists, the app
              uses the league baseline of <strong>{DEFAULT_RATING.toFixed(3)}</strong>. After that,
              each saved result updates their current rating in match order.
            </p>
          </div>
          <div>
            <h3>Pair movement</h3>
            <p>
              Both teammates receive the same change for that game. If Team A gains +0.055, both
              Team A players gain +0.055. Team B&apos;s players receive Team B&apos;s change.
            </p>
          </div>
        </section>

        <section className="explainer-section explainer-panel">
          <div>
            <h3>The calculation</h3>
            <p>
              The app uses these steps for every game. Ratings are rounded for display, but the
              same rule is applied consistently across the leaderboard, weekly table, and player
              charts.
            </p>
          </div>
          <div className="explainer-rule-list">
            <div>
              <span>Team average</span>
              <strong>(Player 1 + Player 2) / 2</strong>
            </div>
            <div>
              <span>Win chance</span>
              <strong>50% plus team rating gap</strong>
              <small>Every 0.100 rating advantage is worth about 20 percentage points.</small>
            </div>
            <div>
              <span>Base move</span>
              <strong>0.100 x upset factor</strong>
              <small>Harder wins earn more. Easier wins earn less.</small>
            </div>
            <div>
              <span>Winner bonus</span>
              <strong>+0.001 per point of margin</strong>
            </div>
            <div>
              <span>Loser credit</span>
              <strong>+0.001 per point scored</strong>
              <small>This reduces the size of the loss.</small>
            </div>
          </div>
        </section>

        <section className="explainer-section explainer-example">
          <div>
            <span className="explainer-card-label">Worked example</span>
            <h3>Equal teams, 11-6 score</h3>
            <p>
              Two teams both average 3.000 before the game. The expected win chance is 50%, so the
              base move is 0.050.
            </p>
          </div>
          <div className="explainer-example-grid">
            <div>
              <span>Base move</span>
              <strong>{equalTeamBaseMove.toFixed(3)}</strong>
            </div>
            <div>
              <span>Winner margin bonus</span>
              <strong>+{exampleMarginBonus.toFixed(3)}</strong>
            </div>
            <div>
              <span>Winner change</span>
              <strong className="positive">+{exampleWinnerMove.toFixed(3)}</strong>
            </div>
            <div>
              <span>Loser point credit</span>
              <strong>+{exampleLoserCredit.toFixed(3)}</strong>
            </div>
            <div>
              <span>Loser change</span>
              <strong className="negative">{exampleLoserMove.toFixed(3)}</strong>
            </div>
          </div>
        </section>

        <section className="explainer-section explainer-panel">
          <h3>How to read the site</h3>
          <ul className="explainer-list">
            <li>
              <strong>Overall</strong> shows current all-time 4DR, wins, losses, games, and
              point differential.
            </li>
            <li>
              <strong>Weekly</strong> shows one session at a time. Rank is still based on that
              week&apos;s 4DR rating, and the weekly change shows how much the rating moved.
            </li>
            <li>
              <strong>Players</strong> shows personal stats, rating history, best friend/foe
              matchups, and head-to-head comparisons.
            </li>
          </ul>
        </section>

        <section className="explainer-section explainer-note">
          <p>
            Ratings are recalculated from the saved history in order. If a result is edited,
            deleted, or imported differently, later ratings can change because each game starts from
            the rating produced by the games before it.
          </p>
        </section>
      </div>
    </section>
  )
}
