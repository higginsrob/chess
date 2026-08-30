import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Color as ChessColor, PieceSymbol, Square } from '../types'
import { squareToLocal } from './coords'
import { GltfClone, pieceNodeName, type ChessNodes } from './ChessSet'

const MAX_FRAME_DT = 1 / 30
const TRAVEL = 12

interface PieceMeshProps {
  type: PieceSymbol
  color: ChessColor
  square: Square
  nodes: ChessNodes
  fading?: boolean
}

export function PieceMesh({ type, color, square, nodes, fading = false }: PieceMeshProps) {
  const group = useRef<Group>(null)
  const target = squareToLocal(square)
  const object = nodes[pieceNodeName(color, type)]

  useLayoutEffect(() => {
    const g = group.current
    if (!g || g.userData.placed) return
    g.position.set(target[0], target[1], target[2])
    g.userData.placed = true
  })

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const step = Math.min(Math.max(dt, 0), MAX_FRAME_DT)
    const k = 1 - Math.exp(-TRAVEL * step)
    const dx = target[0] - g.position.x
    const dz = target[2] - g.position.z
    g.position.x += dx * k
    g.position.z += dz * k
    const hop = Math.min(0.09, Math.hypot(dx, dz) * 0.5)
    g.position.y = target[1] + hop
    if (fading) {
      g.scale.setScalar(Math.max(0.01, g.scale.x - step * 4))
    }
  })

  return (
    <group ref={group}>
      <GltfClone object={object} />
    </group>
  )
}
