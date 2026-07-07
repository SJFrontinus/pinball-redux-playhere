import { add, scale, len } from '../physics/vec2'
import { Collider } from '../physics/colliders'
import { Ball, makeBall } from '../physics/ball'
import { stepBall, CollisionEvent } from '../physics/world'
import { buildTable, LANE_X, Table } from '../table/layout'

export type Phase = 'ready' | 'playing' | 'gameover'
export type SfxName = 'flipper' | 'bumper' | 'sling' | 'post' | 'launch' | 'drain' | 'wall'

const BUMPER_KICK = 380
const SLING_KICK = 320
const HIT_COOLDOWN = 0.06
const PLUNGE_MIN = 950
const PLUNGE_RANGE = 1250
const CHARGE_TIME = 1.1
const TOTAL_BALLS = 3

export class Game {
  table: Table = buildTable()
  ball: Ball
  score = 0
  ballNum = 1
  phase: Phase = 'ready'
  charge = 0
  plungerHeld = false
  time = 0
  /** id -> last hit time, drives render flashes and event cooldowns. */
  hitTimes = new Map<string, number>()
  /** Events from the most recent frame, for the debug overlay. */
  lastEvents: CollisionEvent[] = []
  onSfx: (name: SfxName) => void = () => {}

  constructor() {
    this.ball = makeBall({ ...this.table.spawn })
  }

  ballInLane(): boolean {
    return this.ball.p.x > LANE_X && this.ball.p.y > 780
  }

  step(dt: number): void {
    this.time += dt
    for (const f of this.table.flippers) f.update(dt)
    if (this.phase === 'gameover') return

    if (this.plungerHeld && this.ballInLane()) {
      this.charge = Math.min(1, this.charge + dt / CHARGE_TIME)
    }

    const colliders: Collider[] = [
      ...this.table.statics,
      ...this.table.bumpers,
      ...this.table.flippers.map((f) => f.collider()),
    ]
    const events: CollisionEvent[] = []
    stepBall(this.ball, colliders, dt, events)
    for (const ev of events) this.handleEvent(ev)
    this.lastEvents = events.length ? events : this.lastEvents

    if (this.ball.p.y > this.table.drainY) this.drain()
  }

  private handleEvent(ev: CollisionEvent): void {
    const id = ev.collider.id ?? 'wall'
    const last = this.hitTimes.get(id) ?? -Infinity
    const onCooldown = this.time - last < HIT_COOLDOWN

    if (id.startsWith('bumper') && !onCooldown) {
      this.ball.v = add(this.ball.v, scale(ev.n, BUMPER_KICK))
      this.score += 100
      this.hitTimes.set(id, this.time)
      this.onSfx('bumper')
    } else if ((id === 'slingL' || id === 'slingR') && !onCooldown) {
      this.ball.v = add(this.ball.v, scale(ev.n, SLING_KICK))
      this.score += 50
      this.hitTimes.set(id, this.time)
      this.onSfx('sling')
    } else if (id === 'post' && !onCooldown && ev.impact > 120) {
      this.score += 10
      this.hitTimes.set(id, this.time)
      this.onSfx('post')
    } else if (id === 'wall' && !onCooldown && ev.impact > 500) {
      this.hitTimes.set(id, this.time)
      this.onSfx('wall')
    }
  }

  setFlipper(side: 'left' | 'right', pressed: boolean): void {
    const f = this.table.flippers[side === 'left' ? 0 : 1]
    if (pressed && !f.pressed) this.onSfx('flipper')
    f.pressed = pressed
  }

  setPlunger(held: boolean): void {
    if (this.phase === 'gameover') return
    if (!held && this.plungerHeld) this.release()
    if (held && !this.plungerHeld) this.charge = 0
    this.plungerHeld = held
  }

  private release(): void {
    if (this.ballInLane() && len(this.ball.v) < 120) {
      this.ball.v.y = -(PLUNGE_MIN + PLUNGE_RANGE * this.charge)
      this.phase = 'playing'
      this.onSfx('launch')
    }
    this.charge = 0
  }

  private drain(): void {
    this.onSfx('drain')
    if (this.ballNum >= TOTAL_BALLS) {
      this.phase = 'gameover'
      this.ball.active = false
      return
    }
    this.ballNum++
    this.respawn()
  }

  private respawn(): void {
    this.ball = makeBall({ ...this.table.spawn })
    this.phase = 'ready'
    this.charge = 0
  }

  restart(): void {
    this.score = 0
    this.ballNum = 1
    this.hitTimes.clear()
    this.respawn()
  }
}
