import { memo, Suspense, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { PCFShadowMap, type SpotLight } from 'three'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useLocation } from 'react-router-dom'
import { useGameBoard } from '../game/GameProvider'
import { useSettings } from '../settings/SettingsContext'
import { resultLine } from '../harness/termination'
import { Board } from './Board'
import { Notebook } from './Notebook'
import { Pieces } from './Pieces'
import { Pad } from './Pad'
import { Table } from './Table'
import { ChessRoot, useChessSet } from './ChessSet'
import { PAD_SIZE, TABLE_TOP_Y } from './coords'
import {
  ORBIT_MAX_DISTANCE,
  ORBIT_MAX_POLAR,
  ORBIT_MIN_DISTANCE,
  loadOrbitCamera,
  saveOrbitCamera,
} from './orbitCamera'
import { ZoomDepthOfField } from './ZoomDepthOfField'

const CANVAS_DPR: [number, number] = [1, 2]
const CANVAS_GL = { antialias: false }
const CANVAS_SHADOWS = { type: PCFShadowMap }

export const ChessScene = memo(function ChessScene({ panelHidden = false }: { panelHidden?: boolean }) {
  const { snapshot, clickSquare } = useGameBoard()
  const { settings } = useSettings()
  const location = useLocation()
  const onPlay = location.pathname === '/' || location.pathname === ''
  const interactive = onPlay || panelHidden
  const warm = settings.scene.hdriId === 'medieval_cafe'
  const pose = useMemo(() => loadOrbitCamera(), [])
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const persistCamera = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const { x, y, z } = controls.object.position
    saveOrbitCamera({
      position: [x, y, z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    })
  }, [])

  const result = useMemo(() => {
    if (snapshot.status !== 'ended' || !snapshot.termination || !snapshot.winner) return ''
    return resultLine(snapshot.termination, snapshot.winner)
  }, [snapshot])

  return (
    <div className="scene-root">
      <Canvas
        shadows={CANVAS_SHADOWS}
        dpr={CANVAS_DPR}
        camera={{ position: pose.position, fov: 42, near: 0.1, far: 90 }}
        gl={CANVAS_GL}
      >
        <color attach="background" args={[warm ? '#1c1814' : '#14161a']} />
        <fog attach="fog" args={[warm ? '#1c1814' : '#14161a', 16, 38]} />
        <ambientLight intensity={warm ? 0.55 : 0.5} color={warm ? '#f2e4cc' : '#d8e0ea'} />
        <hemisphereLight
          args={[warm ? '#f0d8b0' : '#c5d0dc', warm ? '#3a3028' : '#2a3038', 1.05]}
        />
        <TableSpot warm={warm} />
        <directionalLight
          castShadow
          position={[8, 14, 6]}
          intensity={warm ? 1.7 : 1.4}
          color={warm ? '#ffe4c4' : '#e8eef5'}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={36}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          target={pose.target}
          minDistance={ORBIT_MIN_DISTANCE}
          maxDistance={ORBIT_MAX_DISTANCE}
          maxPolarAngle={ORBIT_MAX_POLAR}
          onEnd={persistCamera}
        />
        <Suspense fallback={null}>
          <group rotation-y={settings.scene.flipBoard ? Math.PI : 0}>
            <Pad warm={warm} />
            <Table />
            <ChessPlay
              selected={snapshot.selectedSquare}
              legalTargets={snapshot.legalTargets}
              lastMove={snapshot.lastMove}
              onSquare={clickSquare}
              interactive={interactive && snapshot.status === 'in_progress'}
              pieces={snapshot.pieces}
            />
            <Notebook pgn={snapshot.pgn} result={result} />
          </group>
        </Suspense>
        <ContactShadows
          position={[0, 0.02, 0]}
          opacity={0.42}
          scale={PAD_SIZE * 0.7}
          blur={2.4}
          far={5}
        />
        <ZoomDepthOfField />
      </Canvas>
    </div>
  )
})

function TableSpot({ warm }: { warm: boolean }) {
  const lightRef = useRef<SpotLight>(null)

  useLayoutEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.target.position.set(0, TABLE_TOP_Y, 0)
    light.parent?.add(light.target)
    light.target.updateMatrixWorld()
  }, [])

  return (
    <spotLight
      ref={lightRef}
      position={[0.3, 6.2, 0.85]}
      intensity={warm ? 72 : 64}
      color={warm ? '#ffe0bc' : '#f0f4fa'}
      angle={0.48}
      penumbra={0.82}
      distance={18}
      decay={2}
    />
  )
}

function ChessPlay({
  selected,
  legalTargets,
  lastMove,
  onSquare,
  interactive,
  pieces,
}: {
  selected: Parameters<typeof Board>[0]['selected']
  legalTargets: Parameters<typeof Board>[0]['legalTargets']
  lastMove: Parameters<typeof Board>[0]['lastMove']
  onSquare: Parameters<typeof Board>[0]['onSquare']
  interactive: boolean
  pieces: Parameters<typeof Pieces>[0]['pieces']
}) {
  const nodes = useChessSet()
  return (
    <ChessRoot>
      <Board
        nodes={nodes}
        selected={selected}
        legalTargets={legalTargets}
        lastMove={lastMove}
        onSquare={onSquare}
        interactive={interactive}
      />
      <Pieces pieces={pieces} lastMove={lastMove} nodes={nodes} />
    </ChessRoot>
  )
}
