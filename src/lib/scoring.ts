export type ScoringMatch = {
  id: string
  week: string
  playedOn: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number
  scoreB: number
  imported?: boolean
}

export type MatchSummary<TMatch extends ScoringMatch = ScoringMatch> = TMatch & {
  teamAStart: number
  teamBStart: number
  teamADelta: number
  teamBDelta: number
  baseDelta: number
  winner: 'A' | 'B'
}

export function roundRating(value: number) {
  return Math.round(value * 10000) / 10000
}

export function roundBasePoints(value: number) {
  return Math.round(value * 1000) / 1000
}

export function formatRating(value: number) {
  return value.toFixed(3)
}

export function probabilityForTeam(teamAverage: number, opponentAverage: number) {
  return 0.5 + (teamAverage - opponentAverage) * 2
}

export function calculateMatch<TMatch extends ScoringMatch>(
  match: TMatch,
  currentRatings: Map<string, number>,
): MatchSummary<TMatch> {
  const teamAStart =
    ((currentRatings.get(match.teamA[0]) ?? 3) +
      (currentRatings.get(match.teamA[1]) ?? 3)) /
    2
  const teamBStart =
    ((currentRatings.get(match.teamB[0]) ?? 3) +
      (currentRatings.get(match.teamB[1]) ?? 3)) /
    2
  const teamAProbability = probabilityForTeam(teamAStart, teamBStart)
  const winner = match.scoreA > match.scoreB ? 'A' : 'B'
  const winnerProbability =
    winner === 'A' ? teamAProbability : 1 - teamAProbability
  const baseDelta = roundBasePoints(0.1 * (1 - winnerProbability))
  const marginBonus = Math.abs(match.scoreA - match.scoreB) * 0.001
  const loserPointBonus = Math.min(match.scoreA, match.scoreB) * 0.001

  const teamADelta =
    winner === 'A' ? baseDelta + marginBonus : -baseDelta + loserPointBonus
  const teamBDelta =
    winner === 'B' ? baseDelta + marginBonus : -baseDelta + loserPointBonus

  return {
    ...match,
    teamAStart,
    teamBStart,
    teamADelta: roundRating(teamADelta),
    teamBDelta: roundRating(teamBDelta),
    baseDelta,
    winner,
  }
}
