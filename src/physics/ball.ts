import { Vec2, v2 } from './vec2'

export const BALL_RADIUS = 13
export const MAX_SPEED = 3500

/** Collision layer: 'ramp' is the elevated wireform — only ramp walls collide. */
export type BallLayer = 'main' | 'ramp'

export interface Ball {
  p: Vec2
  v: Vec2
  r: number
  active: boolean
  layer: BallLayer
}

export const makeBall = (p: Vec2): Ball => ({
  p,
  v: v2(0, 0),
  r: BALL_RADIUS,
  active: true,
  layer: 'main',
})
