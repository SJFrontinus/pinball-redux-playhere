export interface Vec2 {
  x: number
  y: number
}

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => v2(a.x + b.x, a.y + b.y)
export const sub = (a: Vec2, b: Vec2): Vec2 => v2(a.x - b.x, a.y - b.y)
export const scale = (a: Vec2, s: number): Vec2 => v2(a.x * s, a.y * s)
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))

/** Perpendicular: rotates 90° (x, y) -> (-y, x). */
export const perp = (a: Vec2): Vec2 => v2(-a.y, a.x)

export const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l > 1e-12 ? scale(a, 1 / l) : v2(0, 0)
}

export const clampLen = (a: Vec2, max: number): Vec2 => {
  const l = len(a)
  return l > max ? scale(a, max / l) : a
}
