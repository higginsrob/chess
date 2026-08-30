import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppSettings } from '../types'
import { restoreKeys } from '../providers/keys'
import { defaultSettings } from './defaults'
import { loadSettings, saveSettings } from './storage'

interface SettingsContextValue {
  settings: AppSettings
  setSettings: (next: AppSettings | ((prev: AppSettings) => AppSettings)) => void
  keys: Record<string, string>
  setKey: (providerId: string, key: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    if (typeof localStorage === 'undefined') return defaultSettings()
    return loadSettings()
  })
  const [keys, setKeys] = useState<Record<string, string>>({})

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    restoreKeys(keys)
  }, [keys])

  const setSettings = useCallback(
    (next: AppSettings | ((prev: AppSettings) => AppSettings)) => {
      setSettingsState(next)
    },
    [],
  )

  const setKey = useCallback((providerId: string, key: string) => {
    setKeys((prev) => {
      const copy = { ...prev }
      if (key.trim() === '') delete copy[providerId]
      else copy[providerId] = key
      return copy
    })
  }, [])

  const value = useMemo(
    () => ({ settings, setSettings, keys, setKey }),
    [settings, setSettings, keys, setKey],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
