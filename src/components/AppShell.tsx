import { memo } from 'react'
import Image from 'next/image'
import { Moon, Sun } from 'lucide-react'
import { SyncStatus } from './SyncStatus'
import { buildAdminRoute, buildPublicRoute, type PublicTab } from '../lib/routing'

export const AppHeader = memo(AppHeaderBase)

function AppHeaderBase({
  isAdminPage,
  activeTab,
  theme,
  onTabChange,
  onThemeToggle,
  lastSyncedAt,
  isLoading,
  onLogoLongPress,
}: {
  isAdminPage: boolean
  activeTab: PublicTab
  theme: 'light' | 'dark'
  onTabChange: (tab: PublicTab) => void
  onThemeToggle: () => void
  lastSyncedAt: string | null
  isLoading: boolean
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
        >
          <Image
            className="brand-logo"
            src="/david-lloyd-pickleball-logo.png"
            alt="David Lloyd Clubs Pickleball"
            width={640}
            height={367}
            priority
          />
        </button>
      </div>
      <div className="topbar-actions">
        {!isAdminPage ? (
          <div className="view-tabs header-tabs" role="tablist" aria-label="Leaderboard views">
            {(
              [
                ['overall', 'Overall'],
                ['weekly', 'Weekly'],
                ['players', 'Players'],
                ['how-4dr', 'How 4DR works'],
              ] as const
            ).map(([tab, label]) => (
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
      {!isAdminPage ? <SyncStatus lastSyncedAt={lastSyncedAt} isLoading={isLoading} /> : null}
    </header>
  )
}

export const AppFooter = memo(function AppFooter() {
  return (
    <footer className="app-footer">
      <p>David Lloyd Cardiff Pickleball · 4DR leaderboard</p>
    </footer>
  )
})
