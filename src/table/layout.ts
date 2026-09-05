import { v2, norm, Vec2 } from '../physics/vec2'
import { Collider, CircleCollider, Material, MAT, arcSegments } from '../physics/colliders'
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

export interface Table {
  statics: Collider[]
  rampWalls: Collider[]
  bumpers: CircleCollider[]
  rollovers: RolloverDef[]
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

  // Upper flipper guide rails. Each runs from the pivot up and outward, as on
  // a real machine: nothing can wrap behind the flipper and settle on the
  // pivot end, and a ball dropping down either side is fed onto the flipper.
  // Steep and short so they do not pocket against the mid-table fixtures.
  seg(v2(150, 505), v2(133, 452))
  seg(v2(385, 505), v2(402, 452))

  const flippers: Flipper[] = [
    new Flipper(v2(168, 856), 74, deg(32), deg(-26), 'left'),
    new Flipper(v2(348, 856), 74, deg(148), deg(206), 'right'),
    // Upper pair flanking the middle bumper. Length 52 keeps the raised right
    // tip a ball-width clear of the bumper (the pivots are asymmetric because
    // the drop target alley on the right needs the room).
    new Flipper(v2(150, 505), 52, deg(32), deg(-26), 'left'),
    new Flipper(v2(385, 505), 52, deg(148), deg(206), 'right'),
  ]

  return { statics, rampWalls, bumpers, rollovers, flippers, spawn: v2(518, 880), drainY: 950 }
}
