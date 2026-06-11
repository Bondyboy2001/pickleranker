import { calculateMatch, roundRating } from '../src/lib/scoring'

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

const game1 = applyGame({
  id: 'doc-game-1',
  week: 'Doc example',
  playedOn: '2026-01-01',
  teamA: ['p1', 'p2'],
  teamB: ['p3', 'p4'],
  scoreA: 11,
  scoreB: 6,
})

if (game1.baseDelta.toFixed(3) !== '0.050') {
  throw new Error(`Game 1 base delta expected 0.050, got ${game1.baseDelta.toFixed(3)}`)
}
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

if (game2.baseDelta.toFixed(3) !== '0.051') {
  throw new Error(`Game 2 base delta expected 0.051, got ${game2.baseDelta.toFixed(3)}`)
}
expectRating('p1', 3.014)
expectRating('p3', 2.915)
expectRating('p5', 3.052)
expectRating('p6', 3.052)

console.log('4DR scoring verified against the document examples.')
