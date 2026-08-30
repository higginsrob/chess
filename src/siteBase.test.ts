import { describe, expect, it } from 'vitest'
import { githubPagesBase } from './siteBase'

describe('githubPagesBase', () => {
  it('defaults to /chess/ outside Actions', () => {
    expect(githubPagesBase({})).toBe('/chess/')
  })

  it('uses the GitHub repo name on Actions', () => {
    expect(
      githubPagesBase({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'alice/chess-lab' }),
    ).toBe('/chess-lab/')
  })

  it('uses / for user.github.io repos', () => {
    expect(
      githubPagesBase({
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'alice/alice.github.io',
      }),
    ).toBe('/')
  })

  it('lets VITE_BASE override, with trailing slashes', () => {
    expect(githubPagesBase({ VITE_BASE: '/' })).toBe('/')
    expect(githubPagesBase({ VITE_BASE: 'app' })).toBe('/app/')
    expect(githubPagesBase({ VITE_BASE: '/app/' })).toBe('/app/')
  })
})
