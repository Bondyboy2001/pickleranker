import { calculateMatch, probabilityForTeam, roundRating } from '../src/lib/scoring'

const ratings = new Map<string, number>([
  ['p1', 3],
  ['p2', 3],
  ['p3', 3],
  ['p4', 3],
  ['p5', 3],
  ['p6', 3],
])

function applyGame(match: Parameters<typeof calculateMatch>[0]) {
  const summary = calculateMatch(match, ratings)
  match.teamA.forEach((playerId) => {
    ratings.set(playerId, roundRating((ratings.get(playerId) ?? 3) + summary.teamADelta))
  })
  match.teamB.forEach((playerId) => {
    ratings.set(playerId, roundRating((ratings.get(playerId) ?? 3) + summary.teamBDelta))
  })
  return summary
}

function expectRating(playerId: string, expected: number) {
  const actual = ratings.get(playerId)
  if (actual?.toFixed(3) !== expected.toFixed(3)) {
    throw new Error(
      `${playerId} expected ${expected.toFixed(3)}, got ${actual?.toFixed(3)}`,
    )
  }
}

function expectNumber(label: string, actual: number, expected: number, places = 3) {
  if (actual.toFixed(places) !== expected.toFixed(places)) {
    throw new Error(
      `${label} expected ${expected.toFixed(places)}, got ${actual.toFixed(places)}`,
    )
  }
}

const game1 = applyGame({
  id: 'doc-game-1',
  week: 'Doc example',
  playedOn: '2026-01-01',
  teamA: ['p1', 'p2'],
  teamB: ['p3', 'p4'],
  scoreA: 11,
  scoreB: 6,
})

expectNumber('Game 1 Team A start', game1.teamAStart, 3.000)
expectNumber('Game 1 Team B start', game1.teamBStart, 3.000)
expectNumber('Game 1 base delta', game1.baseDelta, 0.050)
expectNumber('Game 1 Team A delta', game1.teamADelta, 0.055)
expectNumber('Game 1 Team B delta', game1.teamBDelta, -0.044)
expectRating('p1', 3.055)
expectRating('p2', 3.055)
expectRating('p3', 2.956)
expectRating('p4', 2.956)

const game2 = applyGame({
  id: 'doc-game-2',
  week: 'Doc example',
  playedOn: '2026-01-08',
  teamA: ['p1', 'p3'],
  teamB: ['p5', 'p6'],
  scoreA: 10,
  scoreB: 11,
})

expectNumber('Game 2 Team A start', game2.teamAStart, 3.006)
expectNumber('Game 2 Team B start', game2.teamBStart, 3.000)
expectNumber(
  'Game 2 Team A probability',
  probabilityForTeam(game2.teamAStart, game2.teamBStart),
  0.511,
)
expectNumber(
  'Game 2 Team B probability',
  probabilityForTeam(game2.teamBStart, game2.teamAStart),
  0.489,
)
expectNumber('Game 2 base delta', game2.baseDelta, 0.051)
expectNumber('Game 2 Team A delta', game2.teamADelta, -0.041)
expectNumber('Game 2 Team B delta', game2.teamBDelta, 0.052)
expectRating('p1', 3.014)
expectRating('p3', 2.915)
expectRating('p5', 3.052)
expectRating('p6', 3.052)

expectNumber('Equal-team probability', probabilityForTeam(3.000, 3.000), 0.500)
expectNumber('Document game 2 Team 1 probability', probabilityForTeam(3.005, 3.000), 0.510)
expectNumber('Document game 2 Team 2 probability', probabilityForTeam(3.000, 3.005), 0.490)
expectNumber('High rating-gap probability cap', probabilityForTeam(4.000, 3.000), 1.000)
expectNumber('Low rating-gap probability floor', probabilityForTeam(3.000, 4.000), 0.000)

console.log('4DR scoring verified against the document examples.')
