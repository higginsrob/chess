import { memo } from 'react'
import { Html } from '@react-three/drei'
import { BOARD_HALF, TABLE_TOP_Y } from './coords'

export const Notebook = memo(function Notebook({ pgn, result }: { pgn: string; result: string }) {
  const text = [pgn.trim() || '1.', result].filter(Boolean).join('\n\n')
  return (
    <group position={[BOARD_HALF + 0.72, TABLE_TOP_Y + 0.02, 0.2]} rotation={[0, -0.28, 0]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[0.95, 0.035, 1.28]} />
        <meshStandardMaterial color="#d8cfc2" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.86, 1.16]} />
        <meshStandardMaterial color="#f6f1e6" />
      </mesh>
      <Html
        position={[0, 0.035, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        transform
        occlude={false}
        distanceFactor={1.35}
      >
        <div className="notebook-page">
          <div className="notebook-kicker">Notation</div>
          <pre>{text}</pre>
        </div>
      </Html>
    </group>
  )
})
