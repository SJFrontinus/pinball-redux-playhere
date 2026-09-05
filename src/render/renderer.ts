import { Game, LightId } from '../game/state'
import { TABLE_W, TABLE_H, LANE_X, WALL_R, RAMP_ENTRY } from '../table/layout'

const FLASH_DURATION = 0.15
const LIGHT_SHOW_DURATION = 1.2
const TRAIL_LENGTH = 22

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
  ramp: '#3ec6d8',
  lampLit: '#ffd75e',
  lampOff: '#454e70',
  target: '#e0607a',
}

/** Recent ball positions for the motion trail (render-side state only). */
const trail: Array<{ x: number; y: number }> = []

function pushTrail(game: Game): void {
  const p = game.ball.p
  const last = trail[trail.length - 1]
  // A large jump means respawn/teleport — restart the trail.
  if (!game.ball.active || (last && Math.hypot(p.x - last.x, p.y - last.y) > 100)) {
    trail.length = 0
  }
  if (game.ball.active) trail.push({ x: p.x, y: p.y })
  if (trail.length > TRAIL_LENGTH) trail.shift()
}

/** During a light show, lamps strobe in a chase pattern. */
function lampLit(game: Game, id: LightId, index: number): boolean {
  if (game.lightShow) {
    const age = game.time - game.lightShow.t
    if (age < LIGHT_SHOW_DURATION) return (Math.floor(age * 8) + index) % 2 === 0
  }
  return game.lights[id]
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lit: boolean, label?: string): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  if (lit) {
    ctx.save()
    ctx.shadowColor = COLORS.lampLit
    ctx.shadowBlur = 16
    ctx.fillStyle = COLORS.lampLit
    ctx.fill()
    ctx.restore()
  } else {
    ctx.strokeStyle = COLORS.lampOff
    ctx.lineWidth = 2
    ctx.stroke()
  }
  if (label) {
    ctx.font = 'bold 12px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = lit ? '#3a3208' : COLORS.lampOff
    ctx.fillText(label, x, y + 0.5)
  }
}

function drawBall(ctx: CanvasRenderingContext2D, game: Game): void {
  const { p, r: baseR, layer } = game.ball
  const onRamp = layer === 'ramp'
  const r = onRamp ? baseR * 1.3 : baseR

  for (let i = 0; i < trail.length; i++) {
    const k = i / trail.length
    ctx.globalAlpha = 0.3 * k * k
    ctx.fillStyle = '#9fc4ff'
    ctx.beginPath()
    ctx.arc(trail[i].x, trail[i].y, r * (0.3 + 0.6 * k), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  if (onRamp) {
    // Drop shadow sells the elevation.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.beginPath()
    ctx.ellipse(p.x + 3, p.y + 8, r * 0.9, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.15, p.x, p.y, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(1, '#9aa4b8')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
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
      const isTarget = id.startsWith('drop') || id.startsWith('stand')
      const hitFlash = isSling || isTarget ? flash(game, id) : 0
      if (col.active === false) {
        // Dropped target: a dim stub flush with the bank body.
        ctx.strokeStyle = COLORS.lampOff
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(col.a.x + 6, col.a.y + 3)
        ctx.lineTo(col.b.x + 6, col.b.y - 3)
        ctx.stroke()
        continue
      }
      ctx.strokeStyle =
        id === 'gate' ? COLORS.gate
        : isSling ? (hitFlash > 0 ? '#ffffff' : COLORS.sling)
        : isTarget ? (hitFlash > 0 ? '#ffffff' : COLORS.target)
        : id === 'bank-body' ? COLORS.gate
        : id.endsWith('-body') ? COLORS.sling
        : COLORS.wall
      ctx.lineWidth = isSling ? 6 : isTarget ? 7 : id === 'bank-body' ? 3 : 5
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

  // Kickout hole: a recessed disc whose rim pulses while the ball is held so
  // the countdown reads, and flashes on the kick.
  {
    const k = game.table.kickout
    const held = game.capture !== null
    const kickFlash = flash(game, k.id)
    const pulse = held ? 0.5 + 0.5 * Math.sin(game.time * 14) : 0
    const hole = ctx.createRadialGradient(k.c.x, k.c.y, 2, k.c.x, k.c.y, k.r + 4)
    hole.addColorStop(0, '#05070d')
    hole.addColorStop(1, '#1a2133')
    ctx.fillStyle = hole
    ctx.beginPath()
    ctx.arc(k.c.x, k.c.y, k.r + 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = kickFlash > 0 ? '#ffffff' : held ? `rgba(255, 215, 94, ${0.4 + 0.6 * pulse})` : COLORS.rubber
    ctx.stroke()
  }

  // Spinner: a blade rotating about a horizontal axle, seen from above, so its
  // visible height is |cos| of the angle. Glows while it spins.
  {
    const sp = game.table.spinner
    const mid = { x: (sp.a.x + sp.b.x) / 2, y: (sp.a.y + sp.b.y) / 2 }
    const halfW = (sp.b.x - sp.a.x) / 2
    const c = Math.cos(game.spinner.angle * Math.PI * 2)
    const spinning = game.spinner.rate !== 0
    ctx.strokeStyle = '#5a6788'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sp.a.x - 3, sp.a.y)
    ctx.lineTo(sp.b.x + 3, sp.b.y)
    ctx.stroke()
    if (spinning) {
      ctx.save()
      ctx.shadowColor = COLORS.lampLit
      ctx.shadowBlur = 12
    }
    ctx.fillStyle = spinning ? COLORS.lampLit : COLORS.wall
    const h = 2 + 9 * Math.abs(c)
    ctx.fillRect(mid.x - halfW + 2, mid.y - h / 2, halfW * 2 - 4, h)
    if (spinning) ctx.restore()
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

  // Lamps: rollover letters and the ramp arrow at the entrance.
  game.table.rollovers.forEach((ro, i) => {
    drawLamp(ctx, ro.c.x, ro.c.y, ro.r, lampLit(game, ro.id, i), ro.label)
  })
  const rampOn = lampLit(game, 'ramp', 3)
  ctx.beginPath()
  ctx.moveTo(RAMP_ENTRY.x, 572)
  ctx.lineTo(RAMP_ENTRY.x - 9, 592)
  ctx.lineTo(RAMP_ENTRY.x + 9, 592)
  ctx.closePath()
  if (rampOn) {
    ctx.save()
    ctx.shadowColor = COLORS.lampLit
    ctx.shadowBlur = 16
    ctx.fillStyle = COLORS.lampLit
    ctx.fill()
    ctx.restore()
  } else {
    ctx.strokeStyle = COLORS.lampOff
    ctx.lineWidth = 2
    ctx.stroke()
  }

  pushTrail(game)
  const onRamp = game.ball.layer === 'ramp'
  if (game.ball.active && !onRamp) drawBall(ctx, game)

  // Ramp walls sit above the playfield (and above a main-layer ball).
  ctx.save()
  ctx.globalAlpha = onRamp ? 0.9 : 0.4
  ctx.strokeStyle = COLORS.ramp
  ctx.lineWidth = 4
  for (const col of game.table.rampWalls) {
    if (col.kind !== 'segment') continue
    ctx.beginPath()
    ctx.moveTo(col.a.x, col.a.y)
    ctx.lineTo(col.b.x, col.b.y)
    ctx.stroke()
  }
  ctx.restore()
  if (game.ball.active && onRamp) drawBall(ctx, game)

  // Light show: expanding rings from the award, plus a brief GI flash.
  if (game.lightShow) {
    const age = game.time - game.lightShow.t
    if (age < LIGHT_SHOW_DURATION) {
      const { x, y } = game.lightShow
      for (const delay of [0, 0.18]) {
        const a = age - delay
        if (a < 0) continue
        ctx.globalAlpha = 0.6 * (1 - a / LIGHT_SHOW_DURATION)
        ctx.strokeStyle = COLORS.lampLit
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.arc(x, y, 30 + a * 380, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      if (age < 0.35) {
        ctx.fillStyle = `rgba(255, 220, 140, ${0.13 * (1 - age / 0.35)})`
        ctx.fillRect(0, 0, TABLE_W, TABLE_H)
      }
    }
  }
}
