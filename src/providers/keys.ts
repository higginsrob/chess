/** API keys live in RAM only. Refresh discards them. */

const keys = new Map<string, string>()

export function getProviderKey(providerId: string): string | undefined {
  const value = keys.get(providerId)
  return value && value.length > 0 ? value : undefined
}

export function setProviderKey(providerId: string, key: string): void {
  if (key.trim() === '') keys.delete(providerId)
  else keys.set(providerId, key)
}

export function clearProviderKey(providerId: string): void {
  keys.delete(providerId)
}

export function clearAllProviderKeys(): void {
  keys.clear()
}

export function snapshotKeys(): Record<string, string> {
  return Object.fromEntries(keys.entries())
}

export function restoreKeys(next: Record<string, string>): void {
  keys.clear()
  for (const [id, key] of Object.entries(next)) {
    if (key) keys.set(id, key)
  }
}
