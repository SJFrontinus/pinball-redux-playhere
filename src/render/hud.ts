import { Game } from '../game/state'
import { TABLE_W } from '../table/layout'

const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export function renderHud(ctx: CanvasRenderingContext2D, game: Game): void {
  ctx.textBaseline = 'top'

  ctx.font = 'bold 30px ui-monospace, monospace'
  ctx.fillStyle = '#f2e9c9'
  ctx.textAlign = 'left'
  ctx.fillText(String(game.score).padStart(7, '0'), 16, 938)

  ctx.font = '16px ui-monospace, monospace'
  ctx.fillStyle = '#8c96b3'
  ctx.textAlign = 'right'
  ctx.fillText(`BALL ${game.ballNum} / 3`, 480, 948)

  ctx.font = '18px ui-monospace, monospace'
  ctx.textAlign = 'center'
  if (game.phase === 'ready') {
    ctx.fillStyle = '#b8c2dd'
    ctx.fillText(touch ? 'HOLD SCREEN, RELEASE TO LAUNCH' : 'HOLD SPACE, RELEASE TO LAUNCH', TABLE_W / 2, 560)
    ctx.fillStyle = '#68708c'
    ctx.fillText(touch ? 'TAP SIDES FOR FLIPPERS' : 'Z / SHIFT = FLIPPERS', TABLE_W / 2, 588)
  } else if (game.phase === 'gameover') {
    ctx.font = 'bold 34px ui-monospace, monospace'
    ctx.fillStyle = '#f2e9c9'
    ctx.fillText('GAME OVER', TABLE_W / 2, 540)
    ctx.font = '18px ui-monospace, monospace'
    ctx.fillStyle = '#b8c2dd'
    ctx.fillText(touch ? 'TAP TO PLAY AGAIN' : 'PRESS R TO PLAY AGAIN', TABLE_W / 2, 590)
  }
}
