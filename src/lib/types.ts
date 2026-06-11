export type Player = {
  id: string
  name: string
  skillLevel: number
  importedRating?: number
  importedRank?: number
  importedMovement?: string
}

export type Match = {
  id: string
  week: string
  playedOn: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number
  scoreB: number
  imported?: boolean
}

export type WeeklySnapshot = {
  key: string
  label: string
  playedOn: string
  players: {
    playerId: string
    name: string
    rank: number
    rating: number
    movement: string
  }[]
}

export type AppData = {
  players: Player[]
  matches: Match[]
  weeklySnapshots?: WeeklySnapshot[]
}

export type PlayerStanding = Player & {
  rating: number
  wins: number
  losses: number
  games: number
  pointsFor: number
  pointsAgainst: number
}

export type PlayerWeekPoint = {
  key: string
  label: string
  playedOn: string
  change: number
  cumulative: number
  games: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
}

export type WeeklyStanding = {
  playerId: string
  name: string
  change: number
  wins: number
  losses: number
  games: number
  pointsFor: number
  pointsAgainst: number
}

type WeeklyGamePlayer = {
  id: string
  name: string
  start: number
  change: number
  finish: number
}

export type WeeklyPlayerGame = {
  id: string
  gameNumber: number
  week: string
  playedOn: string
  selectedPlayerId: string
  selectedTeam: 'A' | 'B'
  winner: 'A' | 'B'
  scoreA: number
  scoreB: number
  teamAStart: number
  teamBStart: number
  teamAWinProbability: number
  teamADelta: number
  teamBDelta: number
  baseDelta: number
  teamA: WeeklyGamePlayer[]
  teamB: WeeklyGamePlayer[]
  result: 'Win' | 'Loss'
  ratingChange: number
}

export type SortKey = 'rank' | 'player' | 'rating' | 'record' | 'games' | 'wins' | 'losses' | 'pointDiff'
export type SortDirection = 'asc' | 'desc'

export type DbPlayer = {
  id: string
  name: string
  skill_level: number
  imported_rating?: number | null
  imported_rank?: number | null
  imported_movement?: string | null
}

export type DbMatch = {
  id: string
  week: string
  played_on: string
  team_a1: string
  team_a2: string
  team_b1: string
  team_b2: string
  score_a: number
  score_b: number
  imported?: boolean
}

export type MatchFormState = {
  playedOn: string
  teamA1: string
  teamA2: string
  teamB1: string
  teamB2: string
  scoreA: string
  scoreB: string
}
