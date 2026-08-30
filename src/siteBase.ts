/**
 * Local Vite always uses `/chess/` so Pages and preview share paths.
 * In GitHub Actions, derive the base from the repo name so forks still work.
 * Override with `VITE_BASE=/` for a custom domain.
 */
export function githubPagesBase(env: Record<string, string | undefined>): string {
  const explicit = env.VITE_BASE
  if (explicit) {
    if (explicit === '/') return '/'
    return `/${explicit.replace(/^\/+|\/+$/g, '')}/`
  }
  if (env.GITHUB_ACTIONS === 'true') {
    const repo = env.GITHUB_REPOSITORY?.split('/')[1]
    if (repo?.endsWith('.github.io')) return '/'
    if (repo) return `/${repo}/`
  }
  return '/chess/'
}
