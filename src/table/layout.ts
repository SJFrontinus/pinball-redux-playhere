import { v2, norm, Vec2 } from '../physics/vec2'
import { Collider, CircleCollider, Material, MAT, arcSegments } from '../physics/colliders'
import { Flipper } from '../physics/flipper'

export const TABLE_W = 560
export const TABLE_H = 980

/** Inner wall of the plunger lane. */
export const LANE_X = 496
export const WALL_L = 20
export const WALL_R = 540

export interface Table {
  statics: Collider[]
  bumpers: CircleCollider[]
  flippers: [Flipper, Flipper]
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

  const bumpers: CircleCollider[] = [
    { kind: 'circle', c: v2(170, 340), r: 30, mat: MAT.bumper, id: 'bumper0' },
    { kind: 'circle', c: v2(390, 340), r: 30, mat: MAT.bumper, id: 'bumper1' },
    { kind: 'circle', c: v2(280, 460), r: 30, mat: MAT.bumper, id: 'bumper2' },
  ]

  const flippers: [Flipper, Flipper] = [
    new Flipper(v2(168, 856), 74, deg(32), deg(-26)),
    new Flipper(v2(348, 856), 74, deg(148), deg(206)),
  ]

  return { statics, bumpers, flippers, spawn: v2(518, 880), drainY: 950 }
}
