import { useLayoutEffect, useMemo } from 'react'
import { HalfFloatType, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  MaskFunction,
  RenderPass,
} from 'postprocessing'
import { ORBIT_TARGET, zoomDofFromDistance } from './orbitCamera'

function orbitFocus(controls: unknown, fallback: Vector3): Vector3 {
  if (controls && typeof controls === 'object' && 'target' in controls) {
    const target = (controls as { target: unknown }).target
    if (target instanceof Vector3) return target
  }
  return fallback
}

export function ZoomDepthOfField() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const fallbackFocus = useMemo(() => new Vector3(...ORBIT_TARGET), [])

  const { composer, dof } = useMemo(() => {
    const composer = new EffectComposer(gl, {
      depthBuffer: true,
      frameBufferType: HalfFloatType,
      multisampling: 4,
    })
    const dof = new DepthOfFieldEffect(camera, {
      bokehScale: 0,
      focusDistance: 6,
      focusRange: 36,
      resolutionScale: 0.6,
    })
    dof.target = fallbackFocus
    dof.maskFunction = MaskFunction.MULTIPLY_RGB_SET_ALPHA
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new EffectPass(camera, dof))
    return { composer, dof }
  }, [gl, scene, camera, fallbackFocus])

  useLayoutEffect(() => {
    if (size.width > 0 && size.height > 0) composer.setSize(size.width, size.height, false)
  }, [composer, size.width, size.height, dpr])

  useLayoutEffect(() => {
    return () => {
      composer.dispose()
      gl.autoClear = true
    }
  }, [composer, gl])

  useFrame((state, delta) => {
    const focus = orbitFocus(state.controls, fallbackFocus)
    if (dof.target !== focus) dof.target = focus
    const next = zoomDofFromDistance(state.camera.position.distanceTo(focus))
    dof.bokehScale = next.bokehScale
    dof.cocMaterial.focusRange = next.focusRange
    composer.render(delta)
  }, 1)

  return null
}
