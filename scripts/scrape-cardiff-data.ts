import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const BASE_URL = 'https://pickleballranker.com/dlcardiff'
const outputPath = resolve('src/data/cardiffSeed.ts')

type SeedPlayer = {
  id: string
  name: string
  skillLevel: number
  importedRating?: number
  importedRank?: number
  importedMovement?: string
}

type SeedMatch = {
  id: string
  week: string
  playedOn: string
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number
  scoreB: number
  imported: boolean
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function whenToIso(when: string) {
  const [day, month, year] = when.split('-')
  return `${year}-${month}-${day}`
}

async function fetchText(path: string) {
  const url = path.startsWith('http') ? path : `${BASE_URL}/${path}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

function parseAllPlayers(html: string) {
  const players: SeedPlayer[] = []
  const rowRegex = /<tr>\s*<th[^>]*>(\d+)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*<strong>([\d.]+)<\/strong>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g
  let match: RegExpExecArray | null

  while ((match = rowRegex.exec(html))) {
    const rank = Number(match[1])
    const name = stripTags(match[2])
    const rating = Number(match[3])
    const movement = stripTags(match[4])
    players.push({
      id: `p-${slug(name)}`,
      name,
      skillLevel: Math.floor(rating * 2) / 2,
      importedRating: rating,
      importedRank: rank,
      importedMovement: movement,
    })
  }

  return players
}

function parseWeeklyLinks(html: string) {
  return [
    ...html.matchAll(/leaderboard\.php\?when=(\d{2}-\d{2}-\d{4})/g),
  ].map((match) => match[1])
}

function parseLeaderboardPlayers(html: string) {
  return [
    ...html.matchAll(/rank-details\.php\?when=[^&"]+&player=([^"]+)"/g),
  ].map((match) => decodeURIComponent(decodeHtml(match[1])).trim())
}

function parseGameDetails(html: string, when: string, playerId: (name: string) => string) {
  const matches: SeedMatch[] = []
  const tables = html.match(/<table class="table bg-white mt-3">[\s\S]*?<\/table>/g) ?? []

  tables.forEach((table) => {
    const names = [
      ...table.matchAll(/<td class="text-center fdr-text">([\s\S]*?)<\/td>/g),
    ].map((match) => stripTags(match[1]))
    const scores = [
      ...table.matchAll(/<td[^>]*class="text-center fdr-digits align-middle"[^>]*>(\d+)<\/td>/g),
    ].map((match) => Number(match[1]))

    if (names.length !== 4 || scores.length !== 2) return

    matches.push({
      id: '',
      week: `Results ${when}`,
      playedOn: whenToIso(when),
      teamA: [playerId(names[0]), playerId(names[1])],
      teamB: [playerId(names[2]), playerId(names[3])],
      scoreA: scores[0],
      scoreB: scores[1],
      imported: true,
    })
  })

  return matches
}

function matchKey(match: SeedMatch) {
  const teamA = [...match.teamA].sort().join('/')
  const teamB = [...match.teamB].sort().join('/')
  return `${match.playedOn}|${teamA}|${teamB}|${match.scoreA}-${match.scoreB}`
}

async function main() {
  const [indexHtml, allPlayersHtml] = await Promise.all([
    fetchText('index.php'),
    fetchText('all-players-leaderboard.php'),
  ])

  const playerMap = new Map<string, SeedPlayer>()
  parseAllPlayers(allPlayersHtml).forEach((player) => {
    playerMap.set(player.name.toLowerCase(), player)
  })

  const getPlayerId = (name: string) => {
    const key = name.toLowerCase()
    const existing = playerMap.get(key)
    if (existing) return existing.id

    const player = {
      id: `p-${slug(name)}`,
      name,
      skillLevel: 3,
      importedRating: 3,
    }
    playerMap.set(key, player)
    return player.id
  }

  const weeks = parseWeeklyLinks(indexHtml).sort((a, b) =>
    whenToIso(a).localeCompare(whenToIso(b)),
  )
  const dedupedMatches = new Map<string, SeedMatch>()

  for (const when of weeks) {
    const leaderboardHtml = await fetchText(`leaderboard.php?when=${when}`)
    const names = parseLeaderboardPlayers(leaderboardHtml)

    for (const name of names) {
      const detailsHtml = await fetchText(
        `game-details.php?when=${when}&player=${encodeURIComponent(name)}`,
      )
      parseGameDetails(detailsHtml, when, getPlayerId).forEach((match) => {
        const key = matchKey(match)
        if (!dedupedMatches.has(key)) {
          match.id = `m-${dedupedMatches.size + 1}`
          dedupedMatches.set(key, match)
        }
      })
    }

    console.log(`Scraped ${when}: ${names.length} players`)
  }

  const players = [...playerMap.values()].sort((a, b) => {
    if (a.importedRank && b.importedRank) return a.importedRank - b.importedRank
    return a.name.localeCompare(b.name)
  })
  const matches = [...dedupedMatches.values()].sort((a, b) =>
    `${a.playedOn}-${a.id}`.localeCompare(`${b.playedOn}-${b.id}`),
  )

  const source = `// Generated by npm run scrape:cardiff from ${BASE_URL} on ${new Date().toISOString()}.
export const cardiffSeedData = ${JSON.stringify({ players, matches }, null, 2)}
`

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, source)
  console.log(`Wrote ${players.length} players and ${matches.length} games to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
