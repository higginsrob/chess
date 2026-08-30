import { useLayoutEffect, useMemo } from 'react'
import { RepeatWrapping, CanvasTexture, PlaneGeometry, SRGBColorSpace } from 'three'
import { useTexture } from '@react-three/drei'
import { FLOOR } from './assets'
import { PAD_SIZE, PAD_TILES } from './coords'

export function Pad({ warm }: { warm: boolean }) {
  const [diff, nor, arm] = useTexture([FLOOR.diff, FLOOR.nor, FLOOR.arm])
  const fade = useMemo(() => makeEdgeFade(warm), [warm])
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(PAD_SIZE, PAD_SIZE)
    g.setAttribute('uv2', g.attributes.uv.clone())
    return g
  }, [])

  useLayoutEffect(() => {
    for (const tex of [diff, nor, arm]) {
      tex.wrapS = RepeatWrapping
      tex.wrapT = RepeatWrapping
      tex.repeat.set(PAD_TILES, PAD_TILES)
      tex.anisotropy = 8
      tex.needsUpdate = true
    }
    diff.colorSpace = SRGBColorSpace
  }, [diff, nor, arm])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        geometry={geometry}
      >
        <meshStandardMaterial
          map={diff}
          normalMap={nor}
          roughnessMap={arm}
          aoMap={arm}
          roughness={1}
          metalness={0.04}
          aoMapIntensity={0.55}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <planeGeometry args={[PAD_SIZE, PAD_SIZE]} />
        <meshBasicMaterial map={fade} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

function makeEdgeFade(warm: boolean): CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.5)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.65, 'rgba(0,0,0,0)')
  g.addColorStop(1, warm ? 'rgba(28,24,20,0.88)' : 'rgba(20,22,26,0.88)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}
