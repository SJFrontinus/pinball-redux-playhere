import { v2, norm, Vec2 } from '../physics/vec2'
import { Collider, CircleCollider, SegmentCollider, Material, MAT, arcSegments } from '../physics/colliders'
import { Flipper } from '../physics/flipper'

export const TABLE_W = 560
export const TABLE_H = 980

/** Inner wall of the plunger lane. */
export const LANE_X = 496
export const WALL_L = 20
export const WALL_R = 540

export interface RolloverDef {
  c: Vec2
  r: number
  id: 'laneA' | 'laneB' | 'laneC'
  label: string
}

/**
 * Ramp entry/exit zones. The ramp runs up the left side, over the top arc
 * (elevated above bumpers and lanes), and down to an exit above the right
 * inlane. Entry requires upward speed; a slow ball falls back out the entrance.
 */
export const RAMP_ENTRY = { x: 75, halfW: 17, yTop: 515, yBot: 555 }
export const RAMP_EXIT_Y = 445

/**
 * Kickout hole (saucer): a slow ball dropping over the hole is captured, held
 * for `holdTime`, then ejected at a seeded-random angle and speed.
 */
export interface KickoutDef {
  c: Vec2
  r: number
  id: 'kickout'
  holdTime: number
}

/**
 * Spinner: a pass-through sensor segment. Crossing it spins the blade at a
 * rate set by the ball's speed; each revolution scores.
 */
export interface SpinnerDef {
  a: Vec2
  b: Vec2
  id: 'spinner'
}

export interface Table {
  statics: Collider[]
  rampWalls: Collider[]
  bumpers: CircleCollider[]
  rollovers: RolloverDef[]
  kickout: KickoutDef
  spinner: SpinnerDef
  /** Drop target bank faces, in order; also present in `statics`. Toggled via `active`. */
  dropTargets: SegmentCollider[]
  /** Centre of the bank, for the reset-when-clear check. */
  bankCentre: Vec2
  /** Lower pair first, then any upper flippers. Driven by side, not index. */
  flippers: Flipper[]
  spawn: Vec2
  drainY: number
}

const deg = (d: number) => (d * Math.PI) / 180

export function buildTable(): Table {
  const statics: Collider[] = []
  const seg = (a: Vec2, b: Vec2, mat: Material = MAT.wall, id?: string, oneWayN?: Vec2): void => {
    statics.push({ kind: 'segment', a, b, mat, id, oneWayN })
  }

  // Top arc: half-circle roof from left wall over to the outer right wall.
  statics.push(...arcSegments(v2(280, 280), 260, Math.PI, 2 * Math.PI, 32, MAT.wall))

  // Left side: wall, then funnel guiding the ball onto the left flipper.
  seg(v2(WALL_L, 280), v2(WALL_L, 640))
  seg(v2(WALL_L, 640), v2(162, 842))

  // Right side: outer wall and plunger lane (floor, inner wall, funnel).
  seg(v2(WALL_R, 280), v2(WALL_R, 900))
  seg(v2(LANE_X, 900), v2(WALL_R, 900))
  seg(v2(LANE_X, 300), v2(LANE_X, 640))
  seg(v2(LANE_X, 640), v2(354, 842))

  // One-way gate at the top of the plunger lane: the launched ball passes
  // through from below; from the playfield side it acts as a wall.
  seg(v2(LANE_X, 300), v2(WALL_R, 272), MAT.wall, 'gate', norm(v2(-28, -44)))

  // Rubber posts mid-table.
  statics.push({ kind: 'circle', c: v2(110, 610), r: 11, mat: MAT.rubber, id: 'post' })
  statics.push({ kind: 'circle', c: v2(420, 610), r: 11, mat: MAT.rubber, id: 'post' })

  // Slingshots: triangles sitting flush on the funnel walls (no pocket
  // behind them for the ball to wedge into); the upper face kicks.
  const slings: Array<[Vec2, Vec2, Vec2, string]> = [
    [v2(84, 731), v2(185, 790), v2(136, 806), 'slingL'],
    [v2(432, 731), v2(331, 790), v2(380, 806), 'slingR'],
  ]
  for (const [a, b, c, id] of slings) {
    seg(a, b, MAT.sling, id) // active face
    seg(b, c, MAT.wall, `${id}-body`)
    seg(c, a, MAT.wall, `${id}-body`)
  }

  // Shooter guide: an inner arc curving the top of the plunger lane so the
  // launched ball enters the main arc tangentially and hugs it over the top
  // instead of chord-bouncing unpredictably. Radius 217 keeps the channel the
  // same width as the lane. The arc stops at θ352° — short of the gate — so a
  // failed plunge rolls off the gate and drops back to the playfield instead
  // of wedging in the guide/gate corner.
  statics.push(...arcSegments(v2(280, 280), 217, deg(300), deg(352), 12, MAT.wall))

  // Rollover lanes: three A-B-C lanes between four dividers at the top.
  // The region under the arc is a pocket whose only exits are the lanes: the
  // orbiting ball hits the left deflector and slides down into them. On the
  // right, the shooter guide meets the outer divider's top, sealing that side.
  for (const x of [235, 295, 355, 415]) seg(v2(x, 112), v2(x, 188))
  // The deflector ends just above the divider tops (gap < ball diameter, so
  // nothing slips behind it): the ball leaves it ballistically and carries
  // into A, B, or C depending on remaining speed — the skill shot.
  seg(v2(113, 81), v2(235, 95)) // left deflector
  const rollovers: RolloverDef[] = [
    { c: v2(265, 150), r: 10, id: 'laneA', label: 'A' },
    { c: v2(325, 150), r: 10, id: 'laneB', label: 'B' },
    { c: v2(385, 150), r: 10, id: 'laneC', label: 'C' },
  ]

  // Ramp walls (separate collision layer). The straight channels are tangent
  // to the concentric top arcs: outer x = 280 ± 222, inner x = 280 ± 188.
  const rampWalls: Collider[] = [
    { kind: 'segment', a: v2(58, 545), b: v2(58, 280), mat: MAT.wall },
    { kind: 'segment', a: v2(92, 545), b: v2(92, 280), mat: MAT.wall },
    ...arcSegments(v2(280, 280), 222, Math.PI, 2 * Math.PI, 30, MAT.wall),
    ...arcSegments(v2(280, 280), 188, Math.PI, 2 * Math.PI, 26, MAT.wall),
    { kind: 'segment', a: v2(502, 280), b: v2(502, 455), mat: MAT.wall },
    { kind: 'segment', a: v2(468, 280), b: v2(468, 445), mat: MAT.wall },
  ]

  const bumpers: CircleCollider[] = [
    { kind: 'circle', c: v2(170, 340), r: 30, mat: MAT.bumper, id: 'bumper0' },
    { kind: 'circle', c: v2(390, 340), r: 30, mat: MAT.bumper, id: 'bumper1' },
    { kind: 'circle', c: v2(280, 460), r: 30, mat: MAT.bumper, id: 'bumper2' },
  ]

  // Upper flipper guide rails. Each continues the flipper's rest-position top
  // surface outward from the pivot, so a ball dropping onto it rolls straight
  // onto the flipper and nothing can settle on the pivot end. A steeper rail
  // forms a V with the round pivot cap and cradles the ball — found by the
  // rail test, not by eye.
  const rail = (f: Flipper, length: number): void => {
    const d = v2(Math.cos(f.restAngle), Math.sin(f.restAngle))
    const n = v2(-d.y, d.x)
    const up = n.y < 0 ? n : v2(-n.x, -n.y) // perpendicular, pointing up (y-down)
    const a = v2(f.pivot.x + up.x * f.thickness, f.pivot.y + up.y * f.thickness)
    seg(a, v2(a.x - d.x * length, a.y - d.y * length))
  }

  // Kickout hole dead centre below the middle bumper, reachable from both
  // lower flippers. A sensor, not a collider.
  const kickout: KickoutDef = { c: v2(280, 560), r: 16, id: 'kickout', holdTime: 1.2 }

  // Spinner across the ramp mouth, just below the entry zone: the ramp shot
  // rips it on the way up, and a ball that fails the climb spins it again on
  // the way back down. Sensor only — no collider.
  const spinner: SpinnerDef = { a: v2(58, 560), b: v2(92, 560), id: 'spinner' }

  // Drop target bank: three 20 px faces at x = 421 facing left, shot from the
  // lower-left or upper-left flipper. A 20 px gap is narrower than the ball,
  // so a single dropped target does not open a hole; the body behind (top,
  // back, bottom) catches the ball if two drop. Top at y = 520 keeps a clear
  // ball-width between the upper-right rail end (407, 484) and the bank corner;
  // bottom at 580 leaves 19 px to the rubber post at (420, 610) — sealed.
  const dropTargets: SegmentCollider[] = [0, 1, 2].map((i) => ({
    kind: 'segment' as const,
    a: v2(421, 520 + i * 20),
    b: v2(421, 540 + i * 20),
    mat: MAT.target,
    id: `drop${i}`,
  }))
  statics.push(...dropTargets)
  seg(v2(421, 520), v2(449, 520), MAT.wall, 'bank-body')
  seg(v2(449, 520), v2(449, 580), MAT.wall, 'bank-body')
  seg(v2(449, 580), v2(421, 580), MAT.wall, 'bank-body')
  const bankCentre = v2(435, 550)

  // Standup targets flanking the kickout, tilted toward the centre so a ball
  // landing on top rolls off instead of balancing on a flat 20 px ledge.
  seg(v2(205, 552), v2(225, 566), MAT.target, 'standL')
  seg(v2(355, 552), v2(335, 566), MAT.target, 'standR')

  const flippers: Flipper[] = [
    new Flipper(v2(168, 856), 74, deg(32), deg(-26), 'left'),
    new Flipper(v2(348, 856), 74, deg(148), deg(206), 'right'),
    // Upper pair flanking the middle bumper. Length 52 keeps the raised right
    // tip a ball-width clear of the bumper (the pivots are asymmetric because
    // the drop target alley on the right needs the room).
    new Flipper(v2(150, 505), 52, deg(32), deg(-26), 'left'),
    new Flipper(v2(385, 505), 52, deg(148), deg(206), 'right'),
  ]
  rail(flippers[2], 30)
  rail(flippers[3], 30)

  return {
    statics, rampWalls, bumpers, rollovers, kickout, spinner, dropTargets, bankCentre, flippers,
    spawn: v2(518, 880), drainY: 950,
  }
}
