export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${path.replace(/^\//, '')}`
}

export const CHESS_SET_URL = assetUrl('assets/chess_set/chess_set_2k.gltf')

export const FLOOR = {
  diff: assetUrl('assets/worn_concrete_floor/worn_concrete_floor_diff_2k.jpg'),
  nor: assetUrl('assets/worn_concrete_floor/worn_concrete_floor_nor_gl_2k.jpg'),
  arm: assetUrl('assets/worn_concrete_floor/worn_concrete_floor_arm_2k.jpg'),
}
