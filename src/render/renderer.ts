import { Game } from '../game/state'
import { TABLE_W, TABLE_H, LANE_X, WALL_R } from '../table/layout'

const FLASH_DURATION = 0.15

const COLORS = {
  bg: '#0f1420',
  wall: '#7f8db5',
  rubber: '#e0607a',
  sling: '#e0a640',
  gate: '#5a6788',
  bumper: '#d94f3d',
  bumperRing: '#f2b134',
  flipper: '#ffd75e',
  ball: '#e8ecf2',
  plunger: '#9aa7c7',
}

function flash(game: Game, id: string): number {
  const t = game.hitTimes.get(id)
  if (t === undefined) return 0
  const age = game.time - t
  return age < FLASH_DURATION ? 1 - age / FLASH_DURATION : 0
}

export function render(ctx: CanvasRenderingContext2D, game: Game): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, TABLE_W, TABLE_H)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Static geometry.
  for (const col of game.table.statics) {
    if (col.kind === 'segment') {
      const id = col.id ?? ''
      const isSling = id === 'slingL' || id === 'slingR'
      const slingFlash = isSling ? flash(game, id) : 0
      ctx.strokeStyle =
        id === 'gate' ? COLORS.gate
        : isSling ? (slingFlash > 0 ? '#ffffff' : COLORS.sling)
        : id.endsWith('-body') ? COLORS.sling
        : COLORS.wall
      ctx.lineWidth = isSling ? 6 : 5
      if (id === 'gate') {
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 3
      }
      ctx.beginPath()
      ctx.moveTo(col.a.x, col.a.y)
      ctx.lineTo(col.b.x, col.b.y)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (col.kind === 'circle') {
      const f = flash(game, col.id ?? '')
      ctx.fillStyle = f > 0 ? '#ffffff' : COLORS.rubber
      ctx.beginPath()
      ctx.arc(col.c.x, col.c.y, col.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Bumpers.
  for (const b of game.table.bumpers) {
    const f = flash(game, b.id ?? '')
    ctx.beginPath()
    ctx.arc(b.c.x, b.c.y, b.r, 0, Math.PI * 2)
    ctx.fillStyle = f > 0 ? '#ffffff' : COLORS.bumper
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = COLORS.bumperRing
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(b.c.x, b.c.y, b.r * 0.45, 0, Math.PI * 2)
    ctx.fillStyle = f > 0 ? '#f2b134' : '#8c2f22'
    ctx.fill()
  }

  // Flippers.
  for (const f of game.table.flippers) {
    const tip = f.tip()
    ctx.strokeStyle = COLORS.flipper
    ctx.lineWidth = f.thickness * 2
    ctx.beginPath()
    ctx.moveTo(f.pivot.x, f.pivot.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
  }

  // Plunger head at the bottom of the lane, compressing with charge.
  const plungerTop = 905 + game.charge * 45
  ctx.fillStyle = COLORS.plunger
  ctx.fillRect(LANE_X + 6, plungerTop, WALL_R - LANE_X - 12, 14)
  ctx.fillRect(LANE_X + 16, plungerTop + 14, WALL_R - LANE_X - 32, TABLE_H - plungerTop - 14)

  // Ball.
  if (game.ball.active) {
    const { p, r } = game.ball
    const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.15, p.x, p.y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(1, '#9aa4b8')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}
