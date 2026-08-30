import { useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, Object3D } from 'three'
import type { Color, PieceSymbol } from '../types'
import { CHESS_SET_URL } from './assets'
import { CHESS_SCALE, TABLE_TOP_Y } from './coords'

const TEMPLATE_NAME: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    p: 'piece_pawn_white_01',
    r: 'piece_rook_white_01',
    n: 'piece_knight_white_01',
    b: 'piece_bishop_white_01',
    q: 'piece_queen_white',
    k: 'piece_king_white',
  },
  b: {
    p: 'piece_pawn_black_01',
    r: 'piece_rook_black_01',
    n: 'piece_knight_black_01',
    b: 'piece_bishop_black_01',
    q: 'piece_queen_black',
    k: 'piece_king_black',
  },
}

export type ChessNodes = Record<string, Object3D>

export function pieceNodeName(color: Color, type: PieceSymbol): string {
  return TEMPLATE_NAME[color][type]
}

export function useChessSet(): ChessNodes {
  const gltf = useGLTF(CHESS_SET_URL) as unknown as { nodes: ChessNodes }
  return gltf.nodes
}

/** Clone a glTF node with local transform reset so we can place it ourselves. */
export function GltfClone({ object }: { object?: Object3D }) {
  const clone = useMemo(() => {
    if (!object) return null
    const c = object.clone(true)
    c.position.set(0, 0, 0)
    c.rotation.set(0, 0, 0)
    c.scale.set(1, 1, 1)
    c.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return c
  }, [object])
  if (!clone) return null
  return <primitive object={clone} />
}

export function ChessRoot({ children }: { children: ReactNode }) {
  return (
    <group position={[0, TABLE_TOP_Y, 0]} rotation={[0, Math.PI, 0]} scale={CHESS_SCALE}>
      {children}
    </group>
  )
}

useGLTF.preload(CHESS_SET_URL)
