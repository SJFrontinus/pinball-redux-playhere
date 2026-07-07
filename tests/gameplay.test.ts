import { describe, expect, test } from 'bun:test'
import { Game } from '../src/game/state'
import { TABLE_W } from '../src/table/layout'

const DT = 1 / 1000

/** Deterministic LCG so failures reproduce. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function launch(game: Game): void {
  game.setPlunger(true)
  for (let i = 0; i < 1300; i++) game.step(DT)
  game.setPlunger(false)
}

describe('full game simulation', () => {
  test('ball stays on the table, scores, and the game reaches game over', () => {
    const game = new Game()
    const rng = makeRng(0xc0ffee)
    launch(game)

    let flipTimer = 0
    let lastBall = game.ballNum
    let lastMove = 0
    let lastPos = { x: 0, y: 0 }
    const maxSteps = 300_000 // 5 sim-minutes hard cap

    for (let i = 0; i < maxSteps && game.phase !== 'gameover'; i++) {
      game.step(DT)
      const p = game.ball.p

      // Containment: swept collision must never let the ball leave the table.
      expect(p.x).toBeGreaterThan(15)
      expect(p.x).toBeLessThan(TABLE_W - 15)
      expect(p.y).toBeGreaterThan(15)

      // Stuck detection: outside the plunger lane the ball must keep moving.
      if (Math.hypot(p.x - lastPos.x, p.y - lastPos.y) > 3) {
        lastPos = { x: p.x, y: p.y }
        lastMove = i
      }
      if (p.x < 496 && i - lastMove > 8000) {
        throw new Error(`ball stuck at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) after ${(i / 1000).toFixed(1)}s`)
      }

      if (game.ballNum !== lastBall) {
        lastBall = game.ballNum
        // step() may have ended the game; ball.active is false after game over.
        if (game.ball.active) launch(game)
      }

      flipTimer -= DT
      if (p.y > 650 && flipTimer <= 0) {
        game.table.flippers[rng() < 0.5 ? 0 : 1].pressed = true
        flipTimer = 0.25 + rng() * 0.35
      }
      if (flipTimer < 0.13) {
        for (const f of game.table.flippers) f.pressed = false
      }
    }

    expect(game.phase).toBe('gameover')
    expect(game.score).toBeGreaterThan(0)
  }, 30_000)

  test('a soft plunge falls back into the lane instead of entering play', () => {
    const game = new Game()
    game.setPlunger(true)
    for (let i = 0; i < 40; i++) game.step(DT) // barely charged
    game.setPlunger(false)
    for (let i = 0; i < 4000; i++) game.step(DT)
    // Ball should still be in the plunger lane, game not lost.
    expect(game.ball.p.x).toBeGreaterThan(496)
    expect(game.ballNum).toBe(1)
  })
})
