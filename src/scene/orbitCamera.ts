/** Shared orbit-camera limits. Keep in sync with `<OrbitControls>` in ChessScene. */
export const ORBIT_TARGET = [0, 0.95, 0] as const
export const ORBIT_MIN_DISTANCE = 2
export const ORBIT_MAX_DISTANCE = 22
export const ORBIT_MAX_POLAR = Math.PI / 2.05
export const DEFAULT_CAMERA_POSITION = [3.6, 2.5, 4.2] as const
export const CAMERA_STORAGE_KEY = 'chess-lab-camera-v1'

export type Vec3 = [number, number, number]

export interface OrbitCameraPose {
  position: Vec3
  target: Vec3
}

export function defaultOrbitCamera(): OrbitCameraPose {
  return {
    position: [...DEFAULT_CAMERA_POSITION],
    target: [...ORBIT_TARGET],
  }
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.hypot(dx, dy, dz)
}

export function sanitizeOrbitCamera(pose: OrbitCameraPose): OrbitCameraPose | null {
  const dist = distance(pose.position, pose.target)
  if (dist < ORBIT_MIN_DISTANCE - 0.05 || dist > ORBIT_MAX_DISTANCE + 0.05) return null
  if (pose.position[1] < 0.05) return null
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    target: [pose.target[0], pose.target[1], pose.target[2]],
  }
}

export function loadOrbitCamera(): OrbitCameraPose {
  const fallback = defaultOrbitCamera()
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<OrbitCameraPose>
    if (!isVec3(parsed.position) || !isVec3(parsed.target)) return fallback
    return sanitizeOrbitCamera({ position: parsed.position, target: parsed.target }) ?? fallback
  } catch {
    return fallback
  }
}

export function saveOrbitCamera(pose: OrbitCameraPose): void {
  const clean = sanitizeOrbitCamera(pose)
  if (!clean || typeof localStorage === 'undefined') return
  localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(clean))
}

/** Beyond this distance the DoF pass is fully stopped-down (sharp). */
const DOF_FADE_FAR = 11
const MAX_BOKEH_SCALE = 6
/** World-unit CoC ramp at min zoom: board + pieces stay sharp, pad takes the bokeh. */
const NEAR_FOCUS_RANGE = 10
const FAR_FOCUS_RANGE = 36

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export interface ZoomDof {
  /** Hexagonal bokeh radius. 0 = sharp everywhere. */
  bokehScale: number
  /** World-unit band around the focus plane that stays acceptably sharp. */
  focusRange: number
}

/**
 * Map orbit dolly distance to a wide-open close-up vs stopped-down wide shot.
 * Amount is 1 at `ORBIT_MIN_DISTANCE` and 0 by `DOF_FADE_FAR`.
 */
export function zoomDofFromDistance(distance: number): ZoomDof {
  const close = 1 - smoothstep(ORBIT_MIN_DISTANCE, DOF_FADE_FAR, distance)
  const amount = close * close
  return {
    bokehScale: amount * MAX_BOKEH_SCALE,
    focusRange: FAR_FOCUS_RANGE + (NEAR_FOCUS_RANGE - FAR_FOCUS_RANGE) * amount,
  }
}
