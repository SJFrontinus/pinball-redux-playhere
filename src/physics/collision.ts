import { Vec2, add, sub, scale, dot, len, len2, norm, perp } from './vec2'
import { Collider, SegmentCollider } from './colliders'

const EPS = 1e-9

export interface Sweep {
  /** Time of impact within [0, maxT]. */
  t: number
  /** Contact normal, pointing from surface toward the ball. */
  n: Vec2
  /** Contact point on the surface. */
  point: Vec2
}

/**
 * Time of impact of a moving circle (center p, velocity v, radius r) against
 * a static circle (center c, radius R). Closed form: |p + v·t − c| = r + R.
 */
export function sweepCircleVsCircle(
  p: Vec2,
  v: Vec2,
  r: number,
  c: Vec2,
  R: number,
  maxT: number,
): Sweep | null {
  const m = sub(p, c)
  const rr = r + R
  const c0 = len2(m) - rr * rr
  const b = 2 * dot(m, v)
  if (c0 < 0) {
    // Already overlapping: report immediate contact only if approaching.
    if (b < 0) {
      const n = norm(m)
      return { t: 0, n, point: add(c, scale(n, R)) }
    }
    return null
  }
  const a = len2(v)
  if (a < EPS) return null
  const disc = b * b - 4 * a * c0
  if (disc < 0) return null
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  if (t < 0 || t > maxT) return null
  const n = norm(add(sub(p, c), scale(v, t)))
  return { t, n, point: add(c, scale(n, R)) }
}

/**
 * Time of impact of a moving circle against the face of a segment (endpoints
 * excluded — test those separately as point circles). `pad` inflates the
 * segment for capsule cores.
 */
export function sweepCircleVsSegmentFace(
  p: Vec2,
  v: Vec2,
  r: number,
  a: Vec2,
  b: Vec2,
  maxT: number,
  pad = 0,
): Sweep | null {
  const d = sub(b, a)
  const L = len(d)
  if (L < EPS) return null
  const u = scale(d, 1 / L)
  const nRaw = perp(u)
  const sideDist = dot(sub(p, a), nRaw)
  const n = sideDist >= 0 ? nRaw : scale(nRaw, -1)
  const distN = Math.abs(sideDist)
  const rr = r + pad
  const vn = dot(v, n)

  let t: number
  if (distN < rr) {
    // Center already within the slab of the infinite line: immediate contact
    // if approaching and the foot point lies on the segment.
    if (vn >= 0) return null
    t = 0
  } else {
    if (vn >= -EPS) return null
    t = (distN - rr) / -vn
    if (t > maxT) return null
  }
  const q = add(p, scale(v, t))
  const s = dot(sub(q, a), u)
  if (s < 0 || s > L) return null
  return { t, n, point: sub(q, scale(n, rr)) }
}

function segmentSweep(
  p: Vec2,
  v: Vec2,
  r: number,
  a: Vec2,
  b: Vec2,
  maxT: number,
  pad: number,
): Sweep | null {
  let best = sweepCircleVsSegmentFace(p, v, r, a, b, maxT, pad)
  for (const end of [a, b]) {
    const hit = sweepCircleVsCircle(p, v, r, end, pad, maxT)
    if (hit && (!best || hit.t < best.t)) best = hit
  }
  return best
}

function oneWayBlocks(seg: SegmentCollider, p: Vec2): boolean {
  if (!seg.oneWayN) return true
  return dot(sub(p, seg.a), seg.oneWayN) > 0
}

export function sweepCircleVsCollider(
  p: Vec2,
  v: Vec2,
  r: number,
  col: Collider,
  maxT: number,
): Sweep | null {
  switch (col.kind) {
    case 'segment':
      if (!oneWayBlocks(col, p)) return null
      return segmentSweep(p, v, r, col.a, col.b, maxT, 0)
    case 'circle':
      return sweepCircleVsCircle(p, v, r, col.c, col.r, maxT)
    case 'capsule':
      return segmentSweep(p, v, r, col.a, col.b, maxT, col.r)
  }
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const d = sub(b, a)
  const L2 = len2(d)
  if (L2 < EPS) return a
  const s = Math.max(0, Math.min(1, dot(sub(p, a), d) / L2))
  return add(a, scale(d, s))
}

export interface Penetration {
  n: Vec2
  depth: number
  point: Vec2
}

/** Overlap of a circle at p with a collider, if any. Used for resting contact. */
export function penetration(p: Vec2, r: number, col: Collider): Penetration | null {
  let surface: Vec2
  let pad = 0
  switch (col.kind) {
    case 'segment':
      if (!oneWayBlocks(col, p)) return null
      surface = closestPointOnSegment(p, col.a, col.b)
      break
    case 'circle':
      surface = col.c
      pad = col.r
      break
    case 'capsule':
      surface = closestPointOnSegment(p, col.a, col.b)
      pad = col.r
      break
  }
  const m = sub(p, surface)
  const d = len(m)
  const rr = r + pad
  if (d >= rr || d < EPS) return null
  const n = scale(m, 1 / d)
  return { n, depth: rr - d, point: add(surface, scale(n, pad)) }
}
