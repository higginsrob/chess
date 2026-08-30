import type { Square } from '../types'

/** Adjacent-square spacing in the Poly Haven chess_set glTF (meters). */
export const PH_SQUARE = 0.20260828733444214 - 0.144720196723938

/** Top of the board mesh, where piece origins rest. */
export const PH_BOARD_TOP = 0.017392655834555626

/** Half-extent of the board mesh in model space. */
export const PH_BOARD_HALF = 0.27661898732185364

/**
 * Uniform scale for the Poly Haven set. Real size is ~0.55 m; this keeps
 * pieces readable while leaving the tabletop larger than the board.
 */
export const CHESS_SCALE = 4.5

export const SQUARE = PH_SQUARE * CHESS_SCALE
export const BOARD_HALF = PH_BOARD_HALF * CHESS_SCALE

export const TABLE_SIZE = { x: 6.6, z: 4.2 }
export const TABLE_TOP_Y = 0.76
export const TABLE_THICKNESS = 0.1

export const PAD_SIZE = 24
export const PAD_TILES = 12

/** PieceMesh travel; GameProvider waits this long after a ply before look-ahead. */
export const PIECE_TRAVEL_MS = 350

export const BOARD_Y = TABLE_TOP_Y + PH_BOARD_TOP * CHESS_SCALE

/** Square center in chess-set local space (before the 180° Y flip + scale). */
export function squareToLocal(square: Square): [number, number, number] {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const x = (3.5 - file) * PH_SQUARE
  const z = (rank - 3.5) * PH_SQUARE
  return [x, PH_BOARD_TOP, z]
}

/** Square center in world space (table group, no extra parent rotation). */
export function squareToWorld(square: Square): [number, number, number] {
  const [lx, ly, lz] = squareToLocal(square)
  return [-lx * CHESS_SCALE, TABLE_TOP_Y + ly * CHESS_SCALE, -lz * CHESS_SCALE]
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

export function isLightSquare(file: number, rank: number): boolean {
  return (file + rank) % 2 === 1
}
