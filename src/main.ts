import { Game } from './game/state'
import { dump } from './game/replay'
import { startLoop } from './loop'
import { render } from './render/renderer'
import { renderHud } from './render/hud'
import { renderDebug } from './debug'
import { playSfx, unlockAudio } from './audio/sfx'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const game = new Game()
game.onSfx = playSfx
game.record = true
// Exposed for scripted testing and console poking. `dumpReplay()` returns a
// seed + input log that reproduces the current game headlessly (see replay.ts).
const w = window as unknown as { game: Game; dumpReplay: () => string }
w.game = game
w.dumpReplay = () => dump(game)
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

// Touch: hold left/right half for flippers (multi-touch), hold to charge the
// plunger when the ball is waiting (or via the lane strip), tap to restart.
type TouchRole = 'left' | 'right' | 'plunger'
const activeTouches = new Map<number, TouchRole>()

function touchRole(clientX: number): TouchRole {
  const rect = canvas.getBoundingClientRect()
  const xf = (clientX - rect.left) / rect.width
  if (game.phase === 'ready' || xf > 0.86) return 'plunger'
  return xf < 0.5 ? 'left' : 'right'
}

canvas.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault()
    unlockAudio()
    if (game.phase === 'gameover') {
      game.restart()
      return
    }
    for (const t of Array.from(e.changedTouches)) {
      const role = touchRole(t.clientX)
      activeTouches.set(t.identifier, role)
      if (role === 'plunger') game.setPlunger(true)
      else game.setFlipper(role, true)
    }
  },
  { passive: false },
)

canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })

for (const type of ['touchend', 'touchcancel'] as const) {
  canvas.addEventListener(type, (e) => {
    e.preventDefault()
    for (const t of Array.from(e.changedTouches)) {
      const role = activeTouches.get(t.identifier)
      activeTouches.delete(t.identifier)
      if (role === 'plunger') game.setPlunger(false)
      else if (role) game.setFlipper(role, false)
    }
  })
}

startLoop(
  (dt) => game.step(dt),
  (steps) => {
    render(ctx, game)
    renderHud(ctx, game)
    if (debug) renderDebug(ctx, game, steps)
  },
)
