import { add, scale, len, dist } from '../physics/vec2'
import { Collider } from '../physics/colliders'
import { Ball, makeBall } from '../physics/ball'
import { stepBall, CollisionEvent } from '../physics/world'
import { buildTable, LANE_X, RAMP_ENTRY, RAMP_EXIT_Y, Table } from '../table/layout'

export type Phase = 'ready' | 'playing' | 'gameover'
export type SfxName =
  | 'flipper' | 'bumper' | 'sling' | 'post' | 'launch' | 'drain' | 'wall'
  | 'rollover' | 'ramp' | 'bonus'
export type LightId = 'laneA' | 'laneB' | 'laneC' | 'ramp'

const BUMPER_KICK = 380
const SLING_KICK = 320
const HIT_COOLDOWN = 0.06
const ROLLOVER_COOLDOWN = 0.5
/** Minimum upward speed to take the ramp entrance. */
const RAMP_ENTRY_SPEED = -150
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
  lights: Record<LightId, boolean> = { laneA: false, laneB: false, laneC: false, ramp: false }
  /** Set on lane completion / ramp completion; drives the render light show. */
  lightShow: { t: number; x: number; y: number } | null = null
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

    const colliders: Collider[] =
      this.ball.layer === 'ramp'
        ? this.table.rampWalls
        : [
            ...this.table.statics,
            ...this.table.bumpers,
            ...this.table.flippers.map((f) => f.collider()),
          ]
    const events: CollisionEvent[] = []
    stepBall(this.ball, colliders, dt, events)
    for (const ev of events) this.handleEvent(ev)
    this.lastEvents = events.length ? events : this.lastEvents

    this.checkTriggers()
    if (this.ball.p.y > this.table.drainY) this.drain()
  }

  /** Non-colliding sensors: ramp entry/exit portals and rollover lanes. */
  private checkTriggers(): void {
    const b = this.ball
    if (b.layer === 'main') {
      if (
        Math.abs(b.p.x - RAMP_ENTRY.x) < RAMP_ENTRY.halfW &&
        b.p.y > RAMP_ENTRY.yTop &&
        b.p.y < RAMP_ENTRY.yBot &&
        b.v.y < RAMP_ENTRY_SPEED
      ) {
        b.layer = 'ramp'
        this.onSfx('ramp')
      }
      for (const ro of this.table.rollovers) {
        if (dist(b.p, ro.c) >= b.r + ro.r) continue
        const last = this.hitTimes.get(ro.id) ?? -Infinity
        if (this.time - last < ROLLOVER_COOLDOWN) continue
        this.hitTimes.set(ro.id, this.time)
        this.score += 150
        this.lights[ro.id] = true
        this.onSfx('rollover')
        if (this.lights.laneA && this.lights.laneB && this.lights.laneC) {
          this.score += 1500
          this.lights.laneA = this.lights.laneB = this.lights.laneC = false
          this.lights.ramp = true // lanes light the ramp bonus
          this.lightShow = { t: this.time, x: 280, y: 150 }
          this.onSfx('bonus')
        }
      }
    } else if (b.p.y > RAMP_ENTRY.yBot && b.p.x < 280) {
      b.layer = 'main' // too slow — fell back out the entrance
    } else if (b.p.y > RAMP_EXIT_Y && b.p.x > 280) {
      b.layer = 'main'
      this.rampComplete()
    }
  }

  private rampComplete(): void {
    if (this.lights.ramp) {
      this.score += 2000
      this.lights.ramp = false
    } else {
      this.score += 750
    }
    this.lightShow = { t: this.time, x: 485, y: RAMP_EXIT_Y }
    this.onSfx('bonus')
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
    } else if ((id === 'slingL' || id === 'slingR') && !onCooldown && ev.impact > 140) {
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
    this.lights = { laneA: false, laneB: false, laneC: false, ramp: false }
    this.lightShow = null
    this.respawn()
  }
}
