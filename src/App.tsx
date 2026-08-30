import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SettingsProvider, useSettings } from './settings/SettingsContext'
import { GameProvider } from './game/GameProvider'
import { TtsProvider } from './tts/TtsProvider'
import { ChessScene } from './scene/ChessScene'
import { TopBar } from './ui/TopBar'
import { PlayHud } from './pages/PlayPage'
import { SettingsPage } from './pages/SettingsPage'
import { BenchmarksPage } from './pages/BenchmarksPage'
import { ReasoningChat } from './ui/ReasoningChat'
import { GameOverBanner } from './ui/GameOverBanner'
import { BatchBadge } from './ui/BatchBadge'
import { ContextMeter } from './ui/ContextMeter'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

function isPlayPath(pathname: string) {
  return pathname === '/' || pathname === ''
}

function Overlay({
  panelHidden,
  onTogglePanel,
}: {
  panelHidden: boolean
  onTogglePanel: () => void
}) {
  const { pathname } = useLocation()
  const showingSettings = (pathname === '/settings' || pathname.startsWith('/settings/')) && !panelHidden
  const showingBenchmarks =
    (pathname === '/benchmarks' || pathname.startsWith('/benchmarks/')) && !panelHidden
  const showingTabPage = showingSettings || showingBenchmarks
  const showPlayHud = !showingTabPage && !(isPlayPath(pathname) && panelHidden)
  const onPlaySurface = !showingTabPage
  const { settings } = useSettings()

  return (
    <div className="overlay">
      <TopBar
        panelHidden={panelHidden}
        onTogglePanel={onTogglePanel}
        showReasoningToggle={onPlaySurface}
      />
      <div className="overlay-body">
        <Routes>
          <Route path="/" element={null} />
          <Route path="/settings" element={showingSettings ? <SettingsPage /> : null} />
          <Route path="/benchmarks" element={showingBenchmarks ? <BenchmarksPage /> : null} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {onPlaySurface && (
          <div className="play-layout">
            {showPlayHud && <PlayHud />}
            <BatchBadge />
            <GameOverBanner />
            {settings.showReasoningPanel && <ReasoningChat />}
          </div>
        )}
      </div>
      <ContextMeter />
    </div>
  )
}

function AppShell() {
  const { pathname } = useLocation()
  const [panelHidden, setPanelHidden] = useState(false)
  const pathRef = useRef(pathname)

  useEffect(() => {
    if (pathRef.current === pathname) return
    pathRef.current = pathname
    setPanelHidden(false)
  }, [pathname])

  return (
    <div className="app">
      <ChessScene panelHidden={panelHidden} />
      <TtsProvider>
        <Overlay panelHidden={panelHidden} onTogglePanel={() => setPanelHidden((h) => !h)} />
      </TtsProvider>
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <GameProvider>
        <BrowserRouter basename={basename}>
          <AppShell />
        </BrowserRouter>
      </GameProvider>
    </SettingsProvider>
  )
}
