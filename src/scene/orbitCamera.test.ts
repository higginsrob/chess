import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAMERA_STORAGE_KEY,
  DEFAULT_CAMERA_POSITION,
  ORBIT_MAX_DISTANCE,
  ORBIT_MIN_DISTANCE,
  loadOrbitCamera,
  saveOrbitCamera,
  sanitizeOrbitCamera,
  zoomDofFromDistance,
} from './orbitCamera'

describe('zoomDofFromDistance', () => {
  it('is fully open at minimum orbit distance', () => {
    const dof = zoomDofFromDistance(ORBIT_MIN_DISTANCE)
    expect(dof.bokehScale).toBe(6)
    expect(dof.focusRange).toBeCloseTo(10)
  })

  it('is stopped down when zoomed out', () => {
    const far = zoomDofFromDistance(ORBIT_MAX_DISTANCE)
    expect(far.bokehScale).toBe(0)
    expect(far.focusRange).toBe(36)
    expect(zoomDofFromDistance(11).bokehScale).toBe(0)
  })

  it('ramps bokeh up as the camera dollies in', () => {
    const wide = zoomDofFromDistance(10)
    const mid = zoomDofFromDistance(6)
    const close = zoomDofFromDistance(3)
    expect(wide.bokehScale).toBeLessThan(mid.bokehScale)
    expect(mid.bokehScale).toBeLessThan(close.bokehScale)
    expect(close.focusRange).toBeLessThan(mid.focusRange)
  })
})

describe('orbit camera persistence', () => {
  const mem = new Map<string, string>()

  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
      clear: () => mem.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a valid pose', () => {
    const pose = {
      position: [4, 3, 5] as [number, number, number],
      target: [0, 0.95, 0] as [number, number, number],
    }
    saveOrbitCamera(pose)
    expect(loadOrbitCamera()).toEqual(pose)
  })

  it('rejects a camera that is too close', () => {
    expect(
      sanitizeOrbitCamera({
        position: [0, 0.95, 0.2],
        target: [0, 0.95, 0],
      }),
    ).toBeNull()
  })

  it('falls back to the default pose', () => {
    expect(loadOrbitCamera().position).toEqual([...DEFAULT_CAMERA_POSITION])
  })

  it('ignores a stored pose that is out of range', () => {
    mem.set(
      CAMERA_STORAGE_KEY,
      JSON.stringify({ position: [0, 0.95, 0], target: [0, 0.95, 0] }),
    )
    expect(loadOrbitCamera().position).toEqual([...DEFAULT_CAMERA_POSITION])
  })
})
