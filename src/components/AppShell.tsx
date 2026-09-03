import { memo } from 'react'
import Image from 'next/image'
import { Menu, Moon, Sun } from 'lucide-react'
import { SyncStatus } from './SyncStatus'
import { HeaderClock } from './HeaderClock'
import { buildAdminRoute, buildPublicRoute, type PublicTab } from '../lib/routing'

const PUBLIC_TABS = [
  ['overall', 'Overall'],
  ['weekly', 'Weekly'],
  ['players', 'Players'],
  ['how-4dr', 'How 4DR works'],
] as const

const TAB_LABELS: Record<PublicTab, string> = {
  overall: 'Overall',
  weekly: 'Weekly',
  players: 'Players',
  'how-4dr': 'How 4DR works',
}

export const AppHeader = memo(AppHeaderBase)

function AppHeaderBase({
  isAdminPage,
  activeTab,
  theme,
  onTabChange,
  onThemeToggle,
  lastSyncedAt,
  isLoading,
  hasVisibleData,
  onLogoLongPress,
}: {
  isAdminPage: boolean
  activeTab: PublicTab
  theme: 'light' | 'dark'
  onTabChange: (tab: PublicTab) => void
  onThemeToggle: () => void
  lastSyncedAt: string | null
  isLoading: boolean
  hasVisibleData: boolean
  onLogoLongPress: () => void
}) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <button
          type="button"
          className="brand-logo-button"
          onClick={() => {
            if (!isAdminPage) onTabChange('overall')
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            onLogoLongPress()
          }}
          aria-label="David Lloyd Cardiff Pickleball leaderboard home"
          title="Home (right-click for admin)"
        >
          <Image
            className="brand-logo"
            src="/david-lloyd-pickleball-logo.png"
            alt="David Lloyd Clubs Pickleball"
            width={256}
            height={147}
            priority
          />
        </button>
        <HeaderClock />
      </div>
      <div className="topbar-actions">
        {!isAdminPage ? (
          <>
            <div className="view-tabs header-tabs" role="tablist" aria-label="Leaderboard views">
              {PUBLIC_TABS.map(([tab, label]) => (
                <a
                  key={tab}
                  href={buildPublicRoute(tab)}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={activeTab === tab ? 'active' : ''}
                  onClick={(event) => {
                    event.preventDefault()
                    onTabChange(tab)
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
            <details className="mobile-view-menu">
              <summary>
                <Menu size={18} aria-hidden="true" />
                <span>{TAB_LABELS[activeTab]}</span>
              </summary>
              <div role="menu" aria-label="Leaderboard views">
                {PUBLIC_TABS.map(([tab, label]) => (
                  <a
                    key={tab}
                    href={buildPublicRoute(tab)}
                    role="menuitem"
                    aria-current={activeTab === tab ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      event.currentTarget.closest('details')?.removeAttribute('open')
                      onTabChange(tab)
                    }}
                  >
                    {label}
                  </a>
                ))}
                <a href={buildAdminRoute()} role="menuitem" className="mobile-admin-menu-link">
                  Admin
                </a>
              </div>
            </details>
          </>
        ) : (
          <a className="ghost-link admin-link" href={buildPublicRoute('overall')}>
            View public site
          </a>
        )}
        {!isAdminPage ? (
          <a className="ghost-link admin-link header-admin-link" href={buildAdminRoute()}>
            Admin
          </a>
        ) : null}
        <button
          type="button"
          className="theme-toggle"
          onClick={onThemeToggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
      {!isAdminPage ? (
        <SyncStatus
          lastSyncedAt={lastSyncedAt}
          isLoading={isLoading}
          hasVisibleData={hasVisibleData}
        />
      ) : null}
    </header>
  )
}

