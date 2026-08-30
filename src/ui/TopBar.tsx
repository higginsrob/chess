import type { MouseEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useGame } from '../game/GameProvider'
import { useSettings } from '../settings/SettingsContext'
import { batchGameLabel, isMultiRun } from './batchLabel'

const TABS = [
  { to: '/', label: 'Play', end: true },
  { to: '/settings', label: 'Settings', end: false },
  { to: '/benchmarks', label: 'Benchmarks', end: false },
] as const

function pathMatches(pathname: string, to: string, end: boolean): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function TopBar({
  panelHidden,
  onTogglePanel,
  showTurnsToggle,
}: {
  panelHidden: boolean
  onTogglePanel: () => void
  showTurnsToggle: boolean
}) {
  const { pathname } = useLocation()
  const { settings, setSettings } = useSettings()
  const { batch } = useGame()
  const multiRun = isMultiRun(batch)

  function onTabClick(event: MouseEvent<HTMLAnchorElement>, to: string, end: boolean) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    if (!pathMatches(pathname, to, end)) return
    event.preventDefault()
    onTogglePanel()
  }

  return (
    <header className="topbar">
      <div className="brand">Chess lab</div>
      <nav className="nav">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive && !panelHidden ? 'active' : undefined)}
            aria-expanded={pathMatches(pathname, tab.to, tab.end) ? !panelHidden : undefined}
            onClick={(event) => onTabClick(event, tab.to, tab.end)}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {(multiRun || showTurnsToggle) && (
        <div className="topbar-end">
          {multiRun && (
            <div className="topbar-batch" role="status" aria-live="polite">
              {batchGameLabel(batch)}
            </div>
          )}
          {showTurnsToggle && (
            <button
              type="button"
              className={settings.showTurnsPanel ? 'btn primary topbar-reason' : 'btn topbar-reason'}
              aria-pressed={settings.showTurnsPanel}
              aria-controls="turns-panel"
              aria-label={settings.showTurnsPanel ? 'Hide turns panel' : 'Show turns panel'}
              onClick={() =>
                setSettings((s) => ({ ...s, showTurnsPanel: !s.showTurnsPanel }))
              }
            >
              Turns
            </button>
          )}
        </div>
      )}
    </header>
  )
}
