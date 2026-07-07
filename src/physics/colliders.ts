import { Vec2, v2, add, scale } from './vec2'

export interface Material {
  /** Coefficient of restitution (bounciness). */
  e: number
  /** Tangential friction: fraction of tangential relative velocity removed per bounce. */
  f: number
}

export const MAT = {
  wall: { e: 0.45, f: 0.04 },
  rubber: { e: 0.88, f: 0.05 },
  flipper: { e: 0.4, f: 0.1 },
  sling: { e: 0.6, f: 0.05 },
  bumper: { e: 0.7, f: 0.0 },
} as const satisfies Record<string, Material>

interface ColliderBase {
  mat: Material
  /** Identifies game components (bumpers, slings) in collision events. */
  id?: string
  /** Surface velocity at a contact point (kinematic bodies, i.e. flippers). */
  velocityAt?: (p: Vec2) => Vec2
}

export interface SegmentCollider extends ColliderBase {
  kind: 'segment'
  a: Vec2
  b: Vec2
  /**
   * One-way gate: the collider is only active when the ball's center is on
   * the side this normal points toward. Approaching from the other side
   * passes straight through.
   */
  oneWayN?: Vec2
}

export interface CircleCollider extends ColliderBase {
  kind: 'circle'
  c: Vec2
  r: number
}

/** A thick segment with rounded caps — used for flippers. */
export interface CapsuleCollider extends ColliderBase {
  kind: 'capsule'
  a: Vec2
  b: Vec2
  r: number
}

export type Collider = SegmentCollider | CircleCollider | CapsuleCollider

/** Approximates an arc as a polyline of segment colliders. Angles in radians, y-down. */
export function arcSegments(
  center: Vec2,
  radius: number,
  a0: number,
  a1: number,
  steps: number,
  mat: Material,
): SegmentCollider[] {
  const out: SegmentCollider[] = []
  let prev = add(center, scale(v2(Math.cos(a0), Math.sin(a0)), radius))
  for (let i = 1; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps
    const p = add(center, scale(v2(Math.cos(t), Math.sin(t)), radius))
    out.push({ kind: 'segment', a: prev, b: p, mat })
    prev = p
  }
  return out
}
