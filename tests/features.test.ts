import { describe, expect, test } from 'bun:test'
import { Game } from '../src/game/state'
import { RAMP_ENTRY } from '../src/table/layout'

const DT = 1 / 1000

function place(game: Game, x: number, y: number, vx: number, vy: number): void {
  game.phase = 'playing'
  game.ball.p = { x, y }
  game.ball.v = { x: vx, y: vy }
}

describe('ramp', () => {
  test('fast shot into the entrance rides the ramp and exits at the right', () => {
    const game = new Game()
    place(game, RAMP_ENTRY.x, 600, 0, -1600)

    let entered = false
    for (let i = 0; i < 4000; i++) {
      game.step(DT)
      if (game.ball.layer === 'ramp') entered = true
      if (entered && game.ball.layer === 'main') break
    }
    expect(entered).toBe(true)
    expect(game.ball.layer).toBe('main')
    expect(game.ball.p.x).toBeGreaterThan(280) // exited at the right side
    expect(game.score).toBe(750)
  })

  test('slow shot falls back out the entrance without scoring', () => {
    const game = new Game()
    place(game, RAMP_ENTRY.x, 600, 0, -400) // enough to enter, not to climb

    let entered = false
    for (let i = 0; i < 4000; i++) {
      game.step(DT)
      if (game.ball.layer === 'ramp') entered = true
      if (entered && game.ball.layer === 'main') break
    }
    expect(entered).toBe(true)
    expect(game.ball.layer).toBe('main')
    expect(game.ball.p.x).toBeLessThan(280) // came back out where it went in
    expect(game.score).toBe(0)
  })

  test('lit ramp pays 2000 and unlights', () => {
    const game = new Game()
    game.lights.ramp = true
    place(game, RAMP_ENTRY.x, 600, 0, -1600)
    for (let i = 0; i < 4000; i++) {
      game.step(DT)
      if (game.score > 0) break
    }
    expect(game.score).toBe(2000)
    expect(game.lights.ramp).toBe(false)
  })
})

describe('rollovers', () => {
  function rollThrough(game: Game, x: number): void {
    const before = game.score
    place(game, x, 100, 0, 250)
    // Stop at the trigger so the ball doesn't go on to hit a bumper.
    for (let i = 0; i < 700 && game.score === before; i++) game.step(DT)
  }

  test('rolling a lane scores and lights it', () => {
    const game = new Game()
    rollThrough(game, 265)
    expect(game.lights.laneA).toBe(true)
    expect(game.score).toBe(150)
  })

  test('completing A-B-C awards the bonus, resets lanes, lights the ramp', () => {
    const game = new Game()
    rollThrough(game, 265)
    rollThrough(game, 325)
    rollThrough(game, 385)
    expect(game.score).toBe(150 * 3 + 1500)
    expect(game.lights.laneA).toBe(false)
    expect(game.lights.laneB).toBe(false)
    expect(game.lights.laneC).toBe(false)
    expect(game.lights.ramp).toBe(true)
    expect(game.lightShow).not.toBeNull()
  })

  test('cooldown prevents re-triggering while the ball sits on the sensor', () => {
    const game = new Game()
    place(game, 265, 150, 0, 0) // directly on the lane A sensor
    for (let i = 0; i < 300; i++) game.step(DT)
    expect(game.score).toBe(150)
  })
})
