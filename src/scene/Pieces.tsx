import { memo, useEffect, useRef, useState } from 'react'
import type { LastMove, PieceOnBoard } from '../types'
import { PieceMesh } from './PieceMesh'
import type { ChessNodes } from './ChessSet'
import { reconcilePieces, type VisualPiece } from './reconcilePieces'

const FADE_MS = 280

export const Pieces = memo(function Pieces({
  pieces,
  lastMove,
  nodes,
}: {
  pieces: PieceOnBoard[]
  lastMove: LastMove | null
  nodes: ChessNodes
}) {
  const prevRef = useRef<VisualPiece[]>([])
  const fadeTimers = useRef<number[]>([])
  const [visual, setVisual] = useState<VisualPiece[]>([])
  const [dying, setDying] = useState<VisualPiece[]>([])

  useEffect(() => {
    return () => {
      for (const t of fadeTimers.current) window.clearTimeout(t)
      fadeTimers.current = []
    }
  }, [])

  useEffect(() => {
    if (!lastMove) {
      for (const t of fadeTimers.current) window.clearTimeout(t)
      fadeTimers.current = []
      const fresh = pieces.map((p) => ({ id: crypto.randomUUID(), ...p }))
      prevRef.current = fresh
      setVisual(fresh)
      setDying([])
      return
    }
    const { visual: next, captured } = reconcilePieces(prevRef.current, pieces, lastMove)
    prevRef.current = next
    setVisual(next)
    if (captured.length === 0) return
    const ids = new Set(captured.map((c) => c.id))
    setDying((d) => [...d, ...captured])
    // Do not clear this timer when the next ply arrives — React Strict Mode and
    // fast AI vs AI both re-run the effect, and cancelling the fade left captured
    // clones in the scene forever (shadow casters that never unmounted).
    const t = window.setTimeout(() => {
      fadeTimers.current = fadeTimers.current.filter((x) => x !== t)
      setDying((d) => d.filter((x) => !ids.has(x.id)))
    }, FADE_MS)
    fadeTimers.current.push(t)
  }, [pieces, lastMove])

  return (
    <group>
      {visual.map((p) => (
        <PieceMesh
          key={p.id}
          type={p.type}
          color={p.color}
          square={p.square}
          nodes={nodes}
        />
      ))}
      {dying.map((p) => (
        <PieceMesh
          key={p.id}
          type={p.type}
          color={p.color}
          square={p.square}
          nodes={nodes}
          fading
        />
      ))}
    </group>
  )
})
