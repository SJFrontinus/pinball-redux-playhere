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

describe('upper flippers', () => {
  test('the table has two flippers per side', () => {
    const game = new Game()
    const left = game.table.flippers.filter((f) => f.side === 'left')
    const right = game.table.flippers.filter((f) => f.side === 'right')
    expect(left.length).toBe(2)
    expect(right.length).toBe(2)
  })

  test('one button drives every flipper of that side', () => {
    const game = new Game()
    game.setFlipper('left', true)
    for (const f of game.table.flippers) expect(f.pressed).toBe(f.side === 'left')
    game.setFlipper('left', false)
    game.setFlipper('right', true)
    for (const f of game.table.flippers) expect(f.pressed).toBe(f.side === 'right')
  })

  test('a ball dropped onto the upper left flipper is launched upward by the button', () => {
    const game = new Game()
    const upper = game.table.flippers.find((f) => f.side === 'left' && f.pivot.y < 600)!
    // Drop the ball onto the flipper's mid-span and let it settle briefly.
    place(game, upper.pivot.x + 30, upper.pivot.y - 40, 0, 0)
    for (let i = 0; i < 150; i++) game.step(DT)
    expect(game.ball.p.y).toBeLessThan(upper.pivot.y + 40) // it is resting on the flipper, not past it
    game.setFlipper('left', true)
    let minVy = Infinity
    for (let i = 0; i < 300; i++) {
      game.step(DT)
      minVy = Math.min(minVy, game.ball.v.y)
    }
    expect(minVy).toBeLessThan(-600) // a real launch, not a nudge
  })

  test('a ball dropped behind the upper right pivot slides off the guide rail and keeps moving', () => {
    const game = new Game()
    place(game, 395, 440, 0, 0)
    let lastMove = 0
    let last = { ...game.ball.p }
    for (let i = 0; i < 3000; i++) {
      game.step(DT)
      if (Math.hypot(game.ball.p.x - last.x, game.ball.p.y - last.y) > 3) {
        last = { ...game.ball.p }
        lastMove = i
      }
    }
    expect(3000 - lastMove).toBeLessThan(1500) // moved within the last 1.5 s
    expect(game.ball.p.y).toBeGreaterThan(600) // it fell through to the lower table
  })
})
