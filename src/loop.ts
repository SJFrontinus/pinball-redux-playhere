/** Physics substep: 1 kHz keeps per-step travel well under the ball radius. */
export const PHYS_DT = 1 / 1000
/** Don't spiral after a background-tab pause. */
const MAX_FRAME = 0.05

/**
 * Fixed-timestep loop: physics runs at a constant PHYS_DT via an accumulator,
 * rendering runs at whatever rate requestAnimationFrame delivers.
 */
export function startLoop(step: (dt: number) => void, render: (stepsPerFrame: number) => void): void {
  let last = performance.now()
  let accumulator = 0

  function frame(now: number): void {
    accumulator += Math.min((now - last) / 1000, MAX_FRAME)
    last = now
    let steps = 0
    while (accumulator >= PHYS_DT) {
      step(PHYS_DT)
      accumulator -= PHYS_DT
      steps++
    }
    render(steps)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
