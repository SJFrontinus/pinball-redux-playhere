import { Vec2, v2, add, sub, scale, dot, clampLen } from './vec2'
import { Collider } from './colliders'
import { sweepCircleVsCollider, penetration } from './collision'
import { Ball, MAX_SPEED } from './ball'

/** Gravity along the virtual table slope (~6.5°), in px/s². */
export const GRAVITY = v2(0, 1150)
/** Rolling/air drag per second. */
const DRAG = 0.12
/** Below this normal approach speed, bounces become inelastic (resting contact). */
const REST_SPEED = 80
const MAX_RESOLVE_ITERS = 8
const SKIN = 0.05

export interface CollisionEvent {
  collider: Collider
  point: Vec2
  n: Vec2
  /** Normal approach speed at impact. */
  impact: number
}

function surfaceVel(col: Collider, point: Vec2): Vec2 {
  return col.velocityAt ? col.velocityAt(point) : v2(0, 0)
}

/** Reflect ball velocity off a contact, in the surface's reference frame. */
function bounce(ball: Ball, col: Collider, n: Vec2, point: Vec2, events: CollisionEvent[]): void {
  const vs = surfaceVel(col, point)
  const rel = sub(ball.v, vs)
  const vn = dot(rel, n)
  if (vn >= 0) return
  const e = -vn < REST_SPEED ? 0 : col.mat.e
  const tangential = sub(rel, scale(n, vn))
  const newRel = add(scale(tangential, 1 - col.mat.f), scale(n, -e * vn))
  ball.v = add(vs, newRel)
  events.push({ collider: col, point, n, impact: -vn })
}

/**
 * Advance the ball one substep with continuous (swept) collision: repeatedly
 * find the earliest time of impact, advance to it, bounce, and consume the
 * remaining time. A penetration pass afterwards handles resting contact and
 * surfaces that moved into the ball (flippers striking a slow ball).
 */
export function stepBall(ball: Ball, colliders: Collider[], dt: number, events: CollisionEvent[]): void {
  ball.v = add(ball.v, scale(GRAVITY, dt))
  ball.v = scale(ball.v, 1 - DRAG * dt)

  let remaining = dt
  for (let iter = 0; iter < MAX_RESOLVE_ITERS && remaining > 1e-9; iter++) {
    let earliest: { t: number; n: Vec2; point: Vec2; col: Collider } | null = null
    for (const col of colliders) {
      const hit = sweepCircleVsCollider(ball.p, ball.v, ball.r, col, remaining)
      if (hit && (!earliest || hit.t < earliest.t)) {
        earliest = { ...hit, col }
      }
    }
    if (!earliest) {
      ball.p = add(ball.p, scale(ball.v, remaining))
      break
    }
    ball.p = add(ball.p, scale(ball.v, earliest.t))
    remaining -= earliest.t
    bounce(ball, earliest.col, earliest.n, earliest.point, events)
    // Nudge off the surface so the same contact doesn't re-trigger at t=0.
    ball.p = add(ball.p, scale(earliest.n, SKIN))
  }

  // Positional correction + resting contact for anything still overlapping.
  for (const col of colliders) {
    const pen = penetration(ball.p, ball.r, col)
    if (!pen) continue
    ball.p = add(ball.p, scale(pen.n, pen.depth + SKIN))
    bounce(ball, col, pen.n, pen.point, events)
  }

  ball.v = clampLen(ball.v, MAX_SPEED)
}
