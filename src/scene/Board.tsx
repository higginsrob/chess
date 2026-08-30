import { memo } from 'react'
import type { LastMove, Square } from '../types'
import { FILES, RANKS, PH_SQUARE, PH_BOARD_TOP, squareToLocal } from './coords'
import { GltfClone, type ChessNodes } from './ChessSet'

const SELECTED = '#d4af6e'
const LEGAL = '#7a9e7e'
const LAST = '#b5834a'

interface BoardProps {
  nodes: ChessNodes
  selected: Square | null
  legalTargets: Square[]
  lastMove: LastMove | null
  onSquare: (square: Square) => void
  interactive: boolean
}

export const Board = memo(function Board({
  nodes,
  selected,
  legalTargets,
  lastMove,
  onSquare,
  interactive,
}: BoardProps) {
  const squares: Square[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      squares.push(`${FILES[f]}${RANKS[r]}` as Square)
    }
  }

  return (
    <group>
      <GltfClone object={nodes.board} />
      {squares.map((square) => {
        const [x, , z] = squareToLocal(square)
        let color: string | null = null
        if (
          lastMove &&
          (square === lastMove.from ||
            square === lastMove.to ||
            square === lastMove.capturedSquare)
        ) {
          color = LAST
        }
        if (legalTargets.includes(square)) color = LEGAL
        if (selected === square) color = SELECTED
        return (
          <mesh
            key={square}
            position={[x, PH_BOARD_TOP + 0.0006, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation()
              if (interactive) onSquare(square)
            }}
          >
            <planeGeometry args={[PH_SQUARE * 0.94, PH_SQUARE * 0.94]} />
            <meshBasicMaterial
              color={color ?? '#ffffff'}
              transparent
              opacity={color ? 0.4 : 0}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        )
      })}
    </group>
  )
})
