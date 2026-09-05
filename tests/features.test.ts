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
    // Ramp pays 750; the spinner in the mouth adds 50 per revolution on the way up.
    expect(game.spinner.revs).toBeGreaterThan(0)
    expect(game.score).toBe(750 + 50 * game.spinner.revs)
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
    expect(game.score).toBe(50 * game.spinner.revs) // no ramp award, only spinner
  })

  test('lit ramp pays 2000 and unlights', () => {
    const game = new Game()
    game.lights.ramp = true
    place(game, RAMP_ENTRY.x, 600, 0, -1600)
    for (let i = 0; i < 4000; i++) {
      game.step(DT)
      if (!game.lights.ramp) break
    }
    expect(game.lights.ramp).toBe(false)
    expect(game.score).toBe(2000 + 50 * game.spinner.revs)
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
    let maxY = 0
    let last = { ...game.ball.p }
    for (let i = 0; i < 5000; i++) {
      game.step(DT)
      maxY = Math.max(maxY, game.ball.p.y)
      if (Math.hypot(game.ball.p.x - last.x, game.ball.p.y - last.y) > 3) {
        last = { ...game.ball.p }
        lastMove = i
      }
    }
    // Never parked for long (the kickout hold is 1.2 s), and it reached the lower table.
    expect(5000 - lastMove).toBeLessThan(2000)
    expect(maxY).toBeGreaterThan(600)
  })
})

describe('kickout hole', () => {
  test('a slow ball over the hole is captured, held, and ejected upward', () => {
    const game = new Game()
    const k = game.table.kickout
    place(game, k.c.x + 8, k.c.y - 30, 0, 0) // drops in from just above
    let captured = -1
    for (let i = 0; i < 400 && captured < 0; i++) {
      game.step(DT)
      if (game.capture) captured = i
    }
    expect(captured).toBeGreaterThanOrEqual(0)
    expect(game.score).toBe(500)

    // Settles into the centre and stays there for the hold.
    for (let i = 0; i < 300; i++) game.step(DT)
    expect(game.ball.p.x).toBeCloseTo(k.c.x, 3)
    expect(game.ball.p.y).toBeCloseTo(k.c.y, 3)
    expect(game.capture).not.toBeNull()

    // Fires on the timer, upward, within the ball-1 arc.
    let ejected = -1
    for (let i = 0; i < 2000 && ejected < 0; i++) {
      game.step(DT)
      if (!game.capture) ejected = i
    }
    expect(ejected).toBeGreaterThanOrEqual(0)
    const v = game.ball.v
    expect(v.y).toBeLessThan(0)
    const speed = Math.hypot(v.x, v.y)
    expect(speed).toBeGreaterThan(650)
    expect(speed).toBeLessThan(950)
    const fromUp = Math.abs(Math.atan2(v.x, -v.y)) // angle off straight up
    expect(fromUp).toBeLessThan((36 * Math.PI) / 180)
  })

  test('a fast ball skims over the hole without dropping in', () => {
    const game = new Game()
    const k = game.table.kickout
    place(game, k.c.x, k.c.y + 60, 0, -1400) // straight up through the hole
    for (let i = 0; i < 120; i++) game.step(DT)
    expect(game.capture).toBeNull()
  })

  test('the eject is deterministic for a seed and differs across seeds', () => {
    const run = (seed: number) => {
      const game = new Game(seed)
      const k = game.table.kickout
      place(game, k.c.x, k.c.y - 20, 0, 0)
      for (let i = 0; i < 2500; i++) game.step(DT)
      return { ...game.ball.v }
    }
    expect(run(3)).toEqual(run(3))
    expect(run(3)).not.toEqual(run(4))
  })

  test('the hole is inert during the grace window after an eject', () => {
    const game = new Game()
    const k = game.table.kickout
    place(game, k.c.x, k.c.y - 20, 0, 0)
    while (!game.capture) game.step(DT)
    while (game.capture) game.step(DT)
    // Force the ball straight back over the hole at rest immediately after the kick.
    game.ball.p = { ...k.c }
    game.ball.v = { x: 0, y: 0 }
    game.step(DT)
    expect(game.capture).toBeNull()
  })
})

describe('spinner', () => {
  /** Steps until the blade stops; returns the peak revolution count (respawn resets it). */
  const settle = (game: Game): number => {
    let revs = game.spinner.revs
    for (let i = 0; i < 6000 && game.spinner.rate !== 0 && game.ballNum === 1; i++) {
      game.step(DT)
      revs = Math.max(revs, game.spinner.revs)
    }
    return revs
  }

  test('a fast upward crossing rips the spinner for many revolutions', () => {
    const game = new Game()
    const sp = game.table.spinner
    place(game, (sp.a.x + sp.b.x) / 2, sp.a.y + 30, 0, -1600)
    for (let i = 0; i < 40; i++) game.step(DT)
    expect(game.spinner.rate).toBeLessThan(0) // upward = negative
    const revs = settle(game)
    expect(revs).toBeGreaterThan(8)
    expect(game.score).toBeGreaterThanOrEqual(50 * revs) // ramp may add
  })

  test('a slow crossing yields fewer revolutions than a fast one', () => {
    const revsAt = (vy: number) => {
      const game = new Game()
      const sp = game.table.spinner
      // Stop the ramp from taking the ball: enter from the side, downward.
      place(game, (sp.a.x + sp.b.x) / 2, sp.a.y - 20, 0, vy)
      for (let i = 0; i < 500 && game.spinner.rate === 0; i++) game.step(DT)
      return settle(game)
    }
    expect(revsAt(300)).toBeLessThan(revsAt(1200))
    expect(revsAt(300)).toBeGreaterThan(0)
  })

  test('crossing the spinner line outside the blade does nothing', () => {
    const game = new Game()
    const sp = game.table.spinner
    place(game, sp.b.x + 40, sp.a.y + 30, 0, -1200)
    for (let i = 0; i < 80; i++) game.step(DT)
    expect(game.spinner.rate).toBe(0)
    expect(game.spinner.revs).toBe(0)
  })

  test('a failed ramp climb spins it again on the way back down', () => {
    const game = new Game()
    place(game, RAMP_ENTRY.x, 600, 0, -400) // enters the mouth, too slow to climb
    let sawUp = false
    let sawDown = false
    for (let i = 0; i < 4000; i++) {
      game.step(DT)
      if (game.spinner.rate < 0) sawUp = true
      if (sawUp && game.spinner.rate > 0) sawDown = true
      if (sawDown) break
    }
    expect(sawUp).toBe(true)
    expect(sawDown).toBe(true)
  })
})

describe('drop targets and standups', () => {
  /**
   * Fires the ball at a drop target face on a rising line from the lower left,
   * the way the lower-left flipper reaches it: the upper-right flipper at rest
   * shadows the bank from a flat approach.
   */
  const shoot = (game: Game, i: number, speed: number) => {
    const t = game.table.dropTargets[i]
    // Aim the ball centre a little above the face centre (gravity drops it a few px
    // in flight), from a start point clear of the right standup at (335-355, 552-566).
    const y = (t.a.y + t.b.y) / 2 - 4
    const dx = 40
    const dy = 45
    const n = Math.hypot(dx, dy)
    place(game, t.a.x - 13 - dx, y + dy, (speed * dx) / n, (-speed * dy) / n)
    for (let k = 0; k < 200; k++) game.step(DT)
  }

  test('a solid hit drops a target and scores; a dribble does not', () => {
    const game = new Game()
    const t = game.table.dropTargets[1]
    place(game, t.a.x - 16, (t.a.y + t.b.y) / 2, 60, 0) // a dribble from right in front
    for (let k = 0; k < 60; k++) game.step(DT)
    expect(game.table.dropTargets[1].active).not.toBe(false)
    expect(game.score).toBe(0)
    shoot(game, 1, 900)
    expect(game.table.dropTargets[1].active).toBe(false)
    expect(game.score).toBe(300)
  })

  test('a dropped target no longer collides', () => {
    const game = new Game()
    shoot(game, 0, 900)
    expect(game.table.dropTargets[0].active).toBe(false)
    // Fire at the gap: the ball must pass the face line and reach the body behind it.
    const t = game.table.dropTargets[0]
    place(game, t.a.x - 16, (t.a.y + t.b.y) / 2, 600, 0)
    let maxX = 0
    for (let k = 0; k < 120; k++) {
      game.step(DT)
      maxX = Math.max(maxX, game.ball.p.x)
    }
    expect(maxX).toBeGreaterThan(t.a.x + 5)
  })

  test('clearing the bank pays the bonus and resets once the ball is clear', () => {
    const game = new Game()
    shoot(game, 0, 900)
    shoot(game, 1, 900)
    // Third target: catch the moment the bank goes down, before the rebound clears it.
    const t = game.table.dropTargets[2]
    const n = Math.hypot(40, 45)
    place(game, t.a.x - 13 - 40, (t.a.y + t.b.y) / 2 - 4 + 45, (900 * 40) / n, (-900 * 45) / n)
    for (let k = 0; k < 200 && !game.bankDown; k++) game.step(DT)
    expect(game.bankDown).toBe(true)
    expect(game.score).toBe(3 * 300 + 3000)
    expect(game.lightShow).not.toBeNull()
    // Ball parked right in front of the bank: no reset yet.
    game.ball.p = { x: 400, y: 550 }
    game.ball.v = { x: 0, y: 0 }
    game.step(DT)
    expect(game.bankDown).toBe(true)
    expect(game.table.dropTargets.some((t) => t.active === false)).toBe(true)
    // Move it well away: the bank pops back up.
    game.ball.p = { x: 200, y: 700 }
    game.step(DT)
    expect(game.bankDown).toBe(false)
    expect(game.table.dropTargets.every((t) => t.active !== false)).toBe(true)
  })

  test('standup targets score on impact', () => {
    const game = new Game()
    place(game, 215, 620, 0, -700) // straight up into the left standup from below
    for (let k = 0; k < 200; k++) game.step(DT)
    expect(game.score).toBe(200)
  })

  test('a ball dropped onto a standup rolls off instead of balancing', () => {
    const game = new Game()
    place(game, 215, 530, 0, 0)
    for (let k = 0; k < 2000; k++) game.step(DT)
    expect(game.ball.p.y).toBeGreaterThan(620)
  })

  test('restart puts the bank back up', () => {
    const game = new Game()
    shoot(game, 2, 900)
    game.restart()
    expect(game.table.dropTargets.every((t) => t.active !== false)).toBe(true)
  })
})
