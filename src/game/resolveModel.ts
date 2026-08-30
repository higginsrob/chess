import type { AppSettings, ModelConfig, Provider, Seat } from '../types'

export function resolveModel(
  settings: AppSettings,
  seat: Seat,
): { config: ModelConfig; provider: Provider } | null {
  if (seat.type !== 'model') return null
  const config = settings.modelConfigs.find((c) => c.id === seat.modelConfigId)
  if (!config) return null
  const provider = settings.providers.find((p) => p.id === config.providerId)
  if (!provider) return null
  return { config, provider }
}
