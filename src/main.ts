import { Game } from './game/state'
import { startLoop } from './loop'
import { render } from './render/renderer'
import { renderHud } from './render/hud'
import { renderDebug } from './debug'
import { playSfx, unlockAudio } from './audio/sfx'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const game = new Game()
game.onSfx = playSfx
let debug = false

const LEFT_KEYS = new Set(['ShiftLeft', 'KeyZ'])
const RIGHT_KEYS = new Set(['ShiftRight', 'Slash'])
const PLUNGE_KEYS = new Set(['Space', 'ArrowDown'])

window.addEventListener('keydown', (e) => {
  unlockAudio()
  if (e.repeat) return
  if (LEFT_KEYS.has(e.code)) game.setFlipper('left', true)
  if (RIGHT_KEYS.has(e.code)) game.setFlipper('right', true)
  if (PLUNGE_KEYS.has(e.code)) {
    e.preventDefault()
    game.setPlunger(true)
  }
  if (e.code === 'KeyD') debug = !debug
  if (e.code === 'KeyR' && game.phase === 'gameover') game.restart()
})

window.addEventListener('keyup', (e) => {
  if (LEFT_KEYS.has(e.code)) game.setFlipper('left', false)
  if (RIGHT_KEYS.has(e.code)) game.setFlipper('right', false)
  if (PLUNGE_KEYS.has(e.code)) game.setPlunger(false)
})

startLoop(
  (dt) => game.step(dt),
  (steps) => {
    render(ctx, game)
    renderHud(ctx, game)
    if (debug) renderDebug(ctx, game, steps)
  },
)
