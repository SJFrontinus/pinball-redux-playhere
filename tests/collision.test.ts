import { describe, expect, test } from 'bun:test'
import { v2 } from '../src/physics/vec2'
import {
  sweepCircleVsCircle,
  sweepCircleVsSegmentFace,
  sweepCircleVsCollider,
  penetration,
} from '../src/physics/collision'
import { MAT, SegmentCollider } from '../src/physics/colliders'

describe('sweepCircleVsCircle', () => {
  test('head-on hit reports correct TOI and normal', () => {
    // Ball radius 1 at x=-10 moving +x at 10 toward unit circle at origin: gap 8, TOI 0.8.
    const hit = sweepCircleVsCircle(v2(-10, 0), v2(10, 0), 1, v2(0, 0), 1, 10)
    expect(hit).not.toBeNull()
    expect(hit!.t).toBeCloseTo(0.8, 6)
    expect(hit!.n.x).toBeCloseTo(-1, 6)
    expect(hit!.n.y).toBeCloseTo(0, 6)
  })

  test('miss: path passes outside combined radius', () => {
    const hit = sweepCircleVsCircle(v2(-10, 2.5), v2(10, 0), 1, v2(0, 0), 1, 10)
    expect(hit).toBeNull()
  })

  test('graze: path exactly tangent counts as contact', () => {
    const hit = sweepCircleVsCircle(v2(-10, 2), v2(10, 0), 1, v2(0, 0), 1, 10)
    expect(hit).not.toBeNull()
    expect(hit!.t).toBeCloseTo(1.0, 5)
  })

  test('moving away never hits', () => {
    const hit = sweepCircleVsCircle(v2(-10, 0), v2(-10, 0), 1, v2(0, 0), 1, 10)
    expect(hit).toBeNull()
  })

  test('already overlapping and approaching reports t=0', () => {
    const hit = sweepCircleVsCircle(v2(1.5, 0), v2(-10, 0), 1, v2(0, 0), 1, 10)
    expect(hit).not.toBeNull()
    expect(hit!.t).toBe(0)
    expect(hit!.n.x).toBeCloseTo(1, 6)
  })

  test('already overlapping but separating is ignored', () => {
    const hit = sweepCircleVsCircle(v2(1.5, 0), v2(10, 0), 1, v2(0, 0), 1, 10)
    expect(hit).toBeNull()
  })

  test('hit beyond maxT is ignored', () => {
    const hit = sweepCircleVsCircle(v2(-10, 0), v2(10, 0), 1, v2(0, 0), 1, 0.5)
    expect(hit).toBeNull()
  })
})

describe('sweepCircleVsSegmentFace', () => {
  const a = v2(-5, 0)
  const b = v2(5, 0)

  test('falling onto a horizontal segment', () => {
    // Ball radius 1 at y=-10 falling at +y 10 (y-down): contact when center at y=-1.
    const hit = sweepCircleVsSegmentFace(v2(0, -10), v2(0, 10), 1, a, b, 10)
    expect(hit).not.toBeNull()
    expect(hit!.t).toBeCloseTo(0.9, 6)
    expect(hit!.n.y).toBeCloseTo(-1, 6)
    expect(hit!.point.x).toBeCloseTo(0, 6)
    expect(hit!.point.y).toBeCloseTo(0, 6)
  })

  test('approach from the other side flips the normal', () => {
    const hit = sweepCircleVsSegmentFace(v2(0, 10), v2(0, -10), 1, a, b, 10)
    expect(hit).not.toBeNull()
    expect(hit!.n.y).toBeCloseTo(1, 6)
  })

  test('foot point beyond the endpoint misses the face', () => {
    const hit = sweepCircleVsSegmentFace(v2(7, -10), v2(0, 10), 1, a, b, 10)
    expect(hit).toBeNull()
  })

  test('parallel motion never hits', () => {
    const hit = sweepCircleVsSegmentFace(v2(-10, -3), v2(10, 0), 1, a, b, 10)
    expect(hit).toBeNull()
  })

  test('endpoint is caught by the full collider dispatch', () => {
    const seg: SegmentCollider = { kind: 'segment', a, b, mat: MAT.wall }
    // Aimed just past the right endpoint: face misses, endpoint circle catches.
    const hit = sweepCircleVsCollider(v2(5.5, -10), v2(0, 10), 1, seg, 10)
    expect(hit).not.toBeNull()
    expect(hit!.n.y).toBeLessThan(0)
  })

  test('one-way gate passes from behind, blocks in front', () => {
    const gate: SegmentCollider = { kind: 'segment', a, b, mat: MAT.wall, oneWayN: v2(0, -1) }
    // Ball below (pass side) moving up: no collision.
    expect(sweepCircleVsCollider(v2(0, 10), v2(0, -10), 1, gate, 10)).toBeNull()
    // Ball above (block side) moving down: collides.
    expect(sweepCircleVsCollider(v2(0, -10), v2(0, 10), 1, gate, 10)).not.toBeNull()
  })
})

describe('penetration', () => {
  test('overlapping a segment reports depth and outward normal', () => {
    const seg: SegmentCollider = { kind: 'segment', a: v2(-5, 0), b: v2(5, 0), mat: MAT.wall }
    const pen = penetration(v2(0, -0.4), 1, seg)
    expect(pen).not.toBeNull()
    expect(pen!.depth).toBeCloseTo(0.6, 6)
    expect(pen!.n.y).toBeCloseTo(-1, 6)
  })

  test('clear of the collider reports null', () => {
    const seg: SegmentCollider = { kind: 'segment', a: v2(-5, 0), b: v2(5, 0), mat: MAT.wall }
    expect(penetration(v2(0, -2), 1, seg)).toBeNull()
  })
})

describe('tunneling resistance', () => {
  test('extreme speed still finds the contact', () => {
    // 1e5 units/s through a thin wall: discrete stepping would tunnel; swept must not.
    const seg: SegmentCollider = { kind: 'segment', a: v2(-5, 0), b: v2(5, 0), mat: MAT.wall }
    const hit = sweepCircleVsCollider(v2(0, -50), v2(0, 1e5), 1, seg, 1)
    expect(hit).not.toBeNull()
    expect(hit!.t).toBeCloseTo(49 / 1e5, 9)
  })
})
