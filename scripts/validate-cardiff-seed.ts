import { cardiffSeedData } from '../src/data/cardiffSeed'

const BASE = 'https://pickleballranker.com/dlcardiff'

type LeaderboardRow = {
  rank: number
  name: string
  rating: number
  movement: string
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function parseSnapshot(html: string) {
  const players: LeaderboardRow[] = []
  const rowRegex =
    /<tr>\s*<th[^>]*>(\d+)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*<strong>([\d.]+)<\/strong>\s*<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g
  let match: RegExpExecArray | null
  while ((match = rowRegex.exec(html))) {
    players.push({
      rank: Number(match[1]),
      name: stripTags(match[2]),
      rating: Number(match[3]),
      movement: stripTags(match[4]),
    })
  }
  return players
}

async function main() {
  let issues = 0

  const allPlayersHtml = await fetch(`${BASE}/all-players-leaderboard.php`).then((r) =>
    r.text(),
  )
  // all-players has 4 columns not 5 - different regex
  const overallRegex =
    /<tr>\s*<th[^>]*>(\d+)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*<strong>([\d.]+)<\/strong>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g
  const livePlayers: LeaderboardRow[] = []
  let m: RegExpExecArray | null
  while ((m = overallRegex.exec(allPlayersHtml))) {
    livePlayers.push({
      rank: Number(m[1]),
      name: stripTags(m[2]),
      rating: Number(m[3]),
      movement: stripTags(m[4]),
    })
  }

  const seedPlayers = [...cardiffSeedData.players]
    .filter((p) => p.importedRank)
    .sort((a, b) => (a.importedRank ?? 99) - (b.importedRank ?? 99))

  for (let i = 0; i < Math.min(livePlayers.length, seedPlayers.length); i++) {
    const live = livePlayers[i]
    const seed = seedPlayers[i]
    if (
      live.name !== seed.name ||
      Math.abs(live.rating - (seed.importedRating ?? 0)) > 0.001
    ) {
      console.log(
        `Overall #${i + 1}: live ${live.name} ${live.rating} vs seed ${seed.name} ${seed.importedRating}`,
      )
      issues++
    }
  }

  for (const snap of cardiffSeedData.weeklySnapshots ?? []) {
    const html = await fetch(`${BASE}/leaderboard.php?when=${snap.label}`).then((r) =>
      r.text(),
    )
    const live = await parseSnapshot(html)
    for (let i = 0; i < Math.min(live.length, snap.players.length); i++) {
      const l = live[i]
      const s = snap.players[i]
      if (
        l.name !== s.name ||
        Math.abs(l.rating - s.rating) > 0.001 ||
        l.movement !== s.movement
      ) {
        console.log(
          `Week ${snap.label} #${i + 1}: live ${l.name} ${l.rating} ${l.movement} vs seed ${s.name} ${s.rating} ${s.movement}`,
        )
        issues++
      }
    }
    if (live.length !== snap.players.length) {
      console.log(
        `Week ${snap.label}: player count live=${live.length} seed=${snap.players.length}`,
      )
      issues++
    }
  }

  console.log(issues ? `Found ${issues} data issues` : 'Seed data matches live source')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
