export type PublicTab = 'overall' | 'weekly' | 'players' | 'how-4dr'

export type PublicRoute = {
  page: 'public'
  tab: PublicTab
  playerId?: string
  week?: string
}

export type AdminRoute = {
  page: 'admin'
}

export type AppRoute = PublicRoute | AdminRoute

const TAB_PATHS: Record<string, PublicTab> = {
  overall: 'overall',
  weekly: 'weekly',
  players: 'players',
  'how-4dr': 'how-4dr',
}

export function parseRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart] = raw.split('?')
  const params = new URLSearchParams(queryPart ?? '')
  const segments = pathPart.split('/').filter(Boolean)

  if (segments[0] === 'admin' || segments[0] === 'manage') {
    return { page: 'admin' }
  }

  const first = segments[0] ?? ''
  const tab = first === '' ? 'overall' : (TAB_PATHS[first] ?? 'overall')

  if (tab === 'players' && segments[1]) {
    return {
      page: 'public',
      tab: 'players',
      playerId: decodeURIComponent(segments[1]),
    }
  }

  if (tab === 'weekly') {
    return {
      page: 'public',
      tab: 'weekly',
      week: params.get('week') ?? undefined,
      playerId: params.get('player') ?? undefined,
    }
  }

  return { page: 'public', tab }
}

export function buildPublicRoute(
  tab: PublicTab,
  options?: { playerId?: string; week?: string },
): string {
  if (tab === 'overall') return '#/'
  if (tab === 'how-4dr') return '#/how-4dr'

  if (tab === 'players') {
    if (options?.playerId) {
      return `#/players/${encodeURIComponent(options.playerId)}`
    }
    return '#/players'
  }

  if (tab === 'weekly') {
    const params = new URLSearchParams()
    if (options?.week) params.set('week', options.week)
    if (options?.playerId) params.set('player', options.playerId)
    const query = params.toString()
    return query ? `#/weekly?${query}` : '#/weekly'
  }

  return '#/'
}

export function buildAdminRoute() {
  return '#/manage'
}

export function navigateTo(route: AppRoute) {
  const hash =
    route.page === 'admin'
      ? buildAdminRoute()
      : buildPublicRoute(route.tab, {
          playerId: route.playerId,
          week: route.week,
        })
  if (window.location.hash !== hash) {
    window.location.hash = hash
  }
}
