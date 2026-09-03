import { DEFAULT_RATING } from '../lib/standings'

export function RatingExplainer() {
  const equalTeamBaseMove = 0.1 * (1 - 0.5)
  const exampleMarginBonus = (11 - 6) * 0.001
  const exampleLoserCredit = 6 * 0.001
  const exampleWinnerMove = equalTeamBaseMove + exampleMarginBonus
  const exampleLoserMove = -equalTeamBaseMove + exampleLoserCredit

  return (
    <section className="panel rating-explainer-page">
      <h1 className="visually-hidden">How the 4DR pickleball rating works</h1>
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
            <p>The two players on a side are averaged into one team rating before each game.</p>
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
            <h3>The rules</h3>
            <p>Every saved game applies the same four steps, in order.</p>
          </div>
          <div className="explainer-rule-list">
            <div>
              <span>Win chance</span>
              <strong>50% plus the team rating gap</strong>
            </div>
            <div>
              <span>Base move</span>
              <strong>0.100 × upset factor</strong>
            </div>
            <div>
              <span>Winner bonus</span>
              <strong>+0.001 per point of margin</strong>
            </div>
            <div>
              <span>Loser credit</span>
              <strong>+0.001 per point scored</strong>
            </div>
          </div>
        </section>

        <section className="explainer-section explainer-example">
          <div>
            <span className="explainer-card-label">Worked example</span>
            <h3>Equal teams, 11–6</h3>
            <p>Both teams average 3.000, so the win chance is 50% and the base move is 0.050.</p>
          </div>
          <div className="explainer-example-grid">
            <div>
              <span>Winner change</span>
              <strong className="positive">+{exampleWinnerMove.toFixed(3)}</strong>
            </div>
            <div>
              <span>Loser change</span>
              <strong className="negative">{exampleLoserMove.toFixed(3)}</strong>
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
