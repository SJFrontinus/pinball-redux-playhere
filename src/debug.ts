import { Game } from './game/state'
import { len, add, scale } from './physics/vec2'

export function renderDebug(ctx: CanvasRenderingContext2D, game: Game, stepsPerFrame: number): void {
  const { ball } = game

  // Velocity vector.
  if (ball.active) {
    const tip = add(ball.p, scale(ball.v, 0.08))
    ctx.strokeStyle = '#4de07a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ball.p.x, ball.p.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
  }

  // Most recent contact points and normals.
  for (const ev of game.lastEvents) {
    ctx.fillStyle = '#ff5470'
    ctx.beginPath()
    ctx.arc(ev.point.x, ev.point.y, 4, 0, Math.PI * 2)
    ctx.fill()
    const nTip = add(ev.point, scale(ev.n, 22))
    ctx.strokeStyle = '#ff5470'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(ev.point.x, ev.point.y)
    ctx.lineTo(nTip.x, nTip.y)
    ctx.stroke()
  }

  ctx.font = '13px ui-monospace, monospace'
  ctx.fillStyle = '#4de07a'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const lines = [
    `speed ${len(ball.v).toFixed(0)} px/s`,
    `pos ${ball.p.x.toFixed(0)}, ${ball.p.y.toFixed(0)}`,
    `phase ${game.phase}`,
    `layer ${game.ball.layer}`,
    `steps/frame ${stepsPerFrame}`,
  ]
  lines.forEach((l, i) => ctx.fillText(l, 8, 8 + i * 17))
}
