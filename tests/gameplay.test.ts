import { describe, expect, test } from 'bun:test'
import { Game } from '../src/game/state'
import { Rng } from '../src/game/rng'
import { replay, REPLAY_DT } from '../src/game/replay'
import { TABLE_W } from '../src/table/layout'

const DT = 1 / 1000

function launch(game: Game): void {
  game.setPlunger(true)
  for (let i = 0; i < 1300; i++) game.step(DT)
  game.setPlunger(false)
}

/**
 * Plays a full 3-ball game with a seeded random flipper driver, asserting
 * containment and stuck-ball detection on every step. Returns the game.
 */
function playFullGame(seed: number): Game {
  const game = new Game(seed)
  game.record = true
  // The driver's randomness is separate from the game's so that changing one
  // does not silently change the other.
  const rng = new Rng(seed ^ 0x9e3779b9)
  launch(game)

  let flipTimer = 0
  let flipping: 'left' | 'right' | null = null
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
      throw new Error(
        `seed ${seed.toString(16)}: ball stuck at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) after ${(i / 1000).toFixed(1)}s`,
      )
    }

    if (game.ballNum !== lastBall) {
      lastBall = game.ballNum
      // step() may have ended the game; ball.active is false after game over.
      if (game.ball.active) launch(game)
    }

    flipTimer -= DT
    if (p.y > 650 && flipTimer <= 0 && !flipping) {
      flipping = rng.next() < 0.5 ? 'left' : 'right'
      game.setFlipper(flipping, true)
      flipTimer = 0.25 + rng.next() * 0.35
    }
    if (flipping && flipTimer < 0.13) {
      game.setFlipper(flipping, false)
      flipping = null
    }
  }
  return game
}

describe('full game simulation', () => {
  const seeds = [0xc0ffee, 0x0d75_5e75, 1, 7, 12345]
  for (const seed of seeds) {
    test(`seed ${seed.toString(16)}: ball stays on the table, scores, reaches game over`, () => {
      const game = playFullGame(seed)
      expect(game.phase).toBe('gameover')
      expect(game.score).toBeGreaterThan(0)
    }, 30_000)
  }

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

describe('determinism and replay', () => {
  test('the same seed and inputs produce the same game', () => {
    const a = playFullGame(0xc0ffee)
    const b = playFullGame(0xc0ffee)
    expect(b.score).toBe(a.score)
    expect(b.time).toBe(a.time)
    expect(b.log).toEqual(a.log)
  })

  test('a recorded input log replays to the identical final state', () => {
    const live = playFullGame(7)
    const again = replay({ seed: live.seed, log: live.log }, live.time)
    expect(again.phase).toBe('gameover')
    expect(again.score).toBe(live.score)
    expect(again.ballNum).toBe(live.ballNum)
  })

  test('replay applies events at the recorded step', () => {
    const game = replay(
      { seed: 1, log: [{ t: 0, kind: 'plunger', pressed: true }, { t: 1.3, kind: 'plunger', pressed: false }] },
      2,
    )
    expect(game.phase).toBe('playing')
    expect(game.time).toBeCloseTo(2, 6)
    expect(REPLAY_DT).toBe(DT)
  })
})
