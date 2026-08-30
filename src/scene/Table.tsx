import { TABLE_SIZE, TABLE_THICKNESS, TABLE_TOP_Y } from './coords'

const WOOD = '#6a4634'
const WOOD_DARK = '#3f2a20'
const PLANK_COUNT = 9

export function Table() {
  const { x: width, z: depth } = TABLE_SIZE
  const plank = width / PLANK_COUNT
  const gap = 0.018
  const topY = TABLE_TOP_Y - TABLE_THICKNESS / 2
  const legH = TABLE_TOP_Y - TABLE_THICKNESS
  const insetX = width * 0.42
  const insetZ = depth * 0.4

  return (
    <group>
      {Array.from({ length: PLANK_COUNT }, (_, i) => {
        const x = -width / 2 + plank / 2 + i * plank
        return (
          <mesh key={i} castShadow receiveShadow position={[x, topY, 0]}>
            <boxGeometry args={[plank - gap, TABLE_THICKNESS, depth]} />
            <meshStandardMaterial color={i % 2 === 0 ? WOOD : '#5e3f2f'} roughness={0.72} />
          </mesh>
        )
      })}
      <mesh castShadow position={[0, topY - 0.07, 0]}>
        <boxGeometry args={[width * 0.92, 0.06, 0.14]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, topY - 0.07, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[depth * 0.88, 0.06, 0.12]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      {(
        [
          [-insetX, -insetZ],
          [insetX, -insetZ],
          [-insetX, insetZ],
          [insetX, insetZ],
        ] as const
      ).map(([lx, lz]) => (
        <mesh key={`${lx}:${lz}`} castShadow position={[lx, legH / 2, lz]}>
          <boxGeometry args={[0.14, legH, 0.14]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.82} />
        </mesh>
      ))}
    </group>
  )
}
