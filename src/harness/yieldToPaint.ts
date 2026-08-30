/** Let the browser paint / run rAF (orbit + piece slides) before more JS work. */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0))
      return
    }
    setTimeout(resolve, 0)
  })
}

/** Stay under one frame of work so Three.js can keep orbiting. */
const WORK_BUDGET_MS = 6

export async function yieldIfBusy(clock: { now: number }): Promise<void> {
  if (performance.now() - clock.now < WORK_BUDGET_MS) return
  await yieldToPaint()
  clock.now = performance.now()
}
