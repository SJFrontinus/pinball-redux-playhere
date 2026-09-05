import { Vec2, add, scale, len, dist, v2, lerp } from '../physics/vec2'
import { Collider } from '../physics/colliders'
import { Ball, makeBall } from '../physics/ball'
import { stepBall, CollisionEvent } from '../physics/world'
import { buildTable, LANE_X, RAMP_ENTRY, RAMP_EXIT_Y, Table } from '../table/layout'
import { Rng } from './rng'
import { InputEvent } from './replay'

export type Phase = 'ready' | 'playing' | 'gameover'
export type SfxName =
  | 'flipper' | 'bumper' | 'sling' | 'post' | 'launch' | 'drain' | 'wall'
  | 'rollover' | 'ramp' | 'bonus' | 'capture' | 'kick' | 'spin' | 'target' | 'drop'
export type LightId = 'laneA' | 'laneB' | 'laneC' | 'ramp'
/** Where points came from; drives lamps, callouts and the end-of-ball bonus. */
export type ScoreSource =
  | 'bumper' | 'sling' | 'post' | 'rollover' | 'lanes' | 'ramp' | 'rampLit' | 'kickout' | 'spinner' | 'standup' | 'drop' | 'bank'

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
/** Above this speed the ball skims over the kickout hole instead of dropping in. */
const CAPTURE_SPEED = 700
/** Time for the captured ball to settle into the hole centre. */
const CAPTURE_SETTLE = 0.15
/** After an eject, the hole stays inert this long so the ball cannot re-drop. */
const KICKOUT_GRACE = 0.5
/** Spinner: px of ball travel per blade revolution, max rate, decay, points. */
const SPIN_PX_PER_REV = 55
const SPIN_MAX_RATE = 30
const SPIN_DECAY = 1.6
const SPIN_POINTS = 50
/** Minimum impact to knock a drop target down (a dribble just bounces). */
const DROP_IMPACT = 150
/** The bank pops back up once every target is down and the ball is this far away. */
const BANK_RESET_CLEARANCE = 60
export const DEFAULT_SEED = 0x0d75_5e75 // Odysseus

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
  /** Ball held in the kickout hole: when it was taken, from where, and when it fires. */
  capture: { t0: number; from: Vec2; until: number } | null = null
  /** The kickout hole is inert until this time (post-eject grace). */
  private kickoutArmedAt = 0
  /** Spinner blade: angle in revolutions (fractional), signed rate in rev/s, total revs scored. */
  spinner = { angle: 0, rate: 0, revs: 0 }
  private prevP: Vec2 = v2(0, 0)
  /** Set when the last drop target falls; the bank resets once the ball is clear. */
  bankDown = false
  onSfx: (name: SfxName) => void = () => {}
  /** The only source of randomness in the game (constraint: determinism). */
  rng: Rng
  /** Input log for replay; recorded only while `record` is set. */
  record = false
  log: InputEvent[] = []

  constructor(readonly seed: number = DEFAULT_SEED) {
    this.rng = new Rng(seed)
    this.ball = makeBall({ ...this.table.spawn })
  }

  /** Single scoring entry point. Every point on the table passes through here. */
  award(points: number, source: ScoreSource): void {
    void source // consumed by multipliers and bonus tallies in later steps
    this.score += points
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

    if (this.capture) {
      this.holdCaptured()
      return
    }

    const colliders: Collider[] =
      this.ball.layer === 'ramp'
        ? this.table.rampWalls
        : [
            ...this.table.statics.filter((c) => c.active !== false),
            ...this.table.bumpers,
            ...this.table.flippers.map((f) => f.collider()),
          ]
    const events: CollisionEvent[] = []
    this.prevP = { ...this.ball.p }
    stepBall(this.ball, colliders, dt, events)
    for (const ev of events) this.handleEvent(ev)
    this.lastEvents = events.length ? events : this.lastEvents

    this.checkTriggers()
    this.updateSpinner(dt)
    if (this.bankDown && dist(this.ball.p, this.table.bankCentre) > BANK_RESET_CLEARANCE) {
      this.resetBank()
    }
    if (this.ball.p.y > this.table.drainY) this.drain()
  }

  /** Advances the spinner blade, scoring each full revolution, and decays its rate. */
  private updateSpinner(dt: number): void {
    const sp = this.spinner
    if (sp.rate === 0) return
    const before = Math.floor(Math.abs(sp.angle))
    sp.angle += sp.rate * dt
    const after = Math.floor(Math.abs(sp.angle))
    for (let i = before; i < after; i++) {
      sp.revs++
      this.award(SPIN_POINTS, 'spinner')
      this.hitTimes.set(this.table.spinner.id, this.time)
      this.onSfx('spin')
    }
    sp.rate *= Math.exp(-SPIN_DECAY * dt)
    if (Math.abs(sp.rate) < 0.25) sp.rate = 0
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
        this.award(150, 'rollover')
        this.lights[ro.id] = true
        this.onSfx('rollover')
        if (this.lights.laneA && this.lights.laneB && this.lights.laneC) {
          this.award(1500, 'lanes')
          this.lights.laneA = this.lights.laneB = this.lights.laneC = false
          this.lights.ramp = true // lanes light the ramp bonus
          this.lightShow = { t: this.time, x: 280, y: 150 }
          this.onSfx('bonus')
        }
      }
      const sp = this.table.spinner
      const y = sp.a.y
      if ((this.prevP.y - y) * (b.p.y - y) < 0) {
        // Crossed the spinner's line this step; check the crossing point is on the blade.
        const t = (y - this.prevP.y) / (b.p.y - this.prevP.y)
        const x = this.prevP.x + (b.p.x - this.prevP.x) * t
        if (x >= sp.a.x && x <= sp.b.x) {
          const rate = Math.min(SPIN_MAX_RATE, Math.abs(b.v.y) / SPIN_PX_PER_REV)
          this.spinner.rate = Math.sign(b.v.y) * rate
        }
      }
      const k = this.table.kickout
      if (
        this.time >= this.kickoutArmedAt &&
        dist(b.p, k.c) < k.r &&
        len(b.v) < CAPTURE_SPEED
      ) {
        this.capture = { t0: this.time, from: { ...b.p }, until: this.time + k.holdTime }
        b.v = v2(0, 0)
        this.award(500, 'kickout')
        this.onSfx('capture')
      }
    } else if (b.p.y > RAMP_ENTRY.yBot && b.p.x < 280) {
      b.layer = 'main' // too slow — fell back out the entrance
    } else if (b.p.y > RAMP_EXIT_Y && b.p.x > 280) {
      b.layer = 'main'
      this.rampComplete()
    }
  }

  /** Settles the captured ball into the hole, then fires it out on the timer. */
  private holdCaptured(): void {
    const cap = this.capture!
    const k = this.table.kickout
    const s = Math.min(1, (this.time - cap.t0) / CAPTURE_SETTLE)
    this.ball.p = lerp(cap.from, k.c, s * (2 - s)) // ease-out
    if (this.time < cap.until) return

    // Eject arc is centred straight up and widens with ball number; a full
    // 360° eject would periodically fire into the drain and read as cheating.
    const halfArc = (Math.PI / 180) * (35 + 20 * (this.ballNum - 1))
    const angle = -Math.PI / 2 + this.rng.range(-halfArc, halfArc)
    const speed = this.rng.range(700, 900 + 150 * (this.ballNum - 1))
    this.ball.v = v2(Math.cos(angle) * speed, Math.sin(angle) * speed)
    this.capture = null
    this.kickoutArmedAt = this.time + KICKOUT_GRACE
    this.hitTimes.set(k.id, this.time)
    this.onSfx('kick')
  }

  private resetBank(): void {
    for (const t of this.table.dropTargets) t.active = true
    this.bankDown = false
  }

  private rampComplete(): void {
    if (this.lights.ramp) {
      this.award(2000, 'rampLit')
      this.lights.ramp = false
    } else {
      this.award(750, 'ramp')
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
      this.award(100, 'bumper')
      this.hitTimes.set(id, this.time)
      this.onSfx('bumper')
    } else if ((id === 'slingL' || id === 'slingR') && !onCooldown && ev.impact > 140) {
      this.ball.v = add(this.ball.v, scale(ev.n, SLING_KICK))
      this.award(50, 'sling')
      this.hitTimes.set(id, this.time)
      this.onSfx('sling')
    } else if (id.startsWith('drop') && !onCooldown && ev.impact > DROP_IMPACT) {
      ev.collider.active = false
      this.hitTimes.set(id, this.time)
      this.award(300, 'drop')
      this.onSfx('drop')
      if (this.table.dropTargets.every((t) => t.active === false)) {
        this.bankDown = true
        this.award(3000, 'bank')
        this.lightShow = { t: this.time, x: this.table.bankCentre.x, y: this.table.bankCentre.y }
        this.onSfx('bonus')
      }
    } else if ((id === 'standL' || id === 'standR') && !onCooldown && ev.impact > 100) {
      this.hitTimes.set(id, this.time)
      this.award(200, 'standup')
      this.onSfx('target')
    } else if (id === 'post' && !onCooldown && ev.impact > 120) {
      this.award(10, 'post')
      this.hitTimes.set(id, this.time)
      this.onSfx('post')
    } else if (id === 'wall' && !onCooldown && ev.impact > 500) {
      this.hitTimes.set(id, this.time)
      this.onSfx('wall')
    }
  }

  setFlipper(side: 'left' | 'right', pressed: boolean): void {
    if (this.record) this.log.push({ t: this.time, kind: 'flipper', side, pressed })
    let changed = false
    for (const f of this.table.flippers) {
      if (f.side !== side) continue
      if (pressed && !f.pressed) changed = true
      f.pressed = pressed
    }
    if (changed) this.onSfx('flipper')
  }

  setPlunger(held: boolean): void {
    if (this.record) this.log.push({ t: this.time, kind: 'plunger', pressed: held })
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
    this.spinner = { angle: 0, rate: 0, revs: 0 }
    this.capture = null
    this.kickoutArmedAt = 0
    this.ball = makeBall({ ...this.table.spawn })
    this.phase = 'ready'
    this.charge = 0
  }

  restart(): void {
    this.resetBank()
    this.rng = new Rng(this.seed)
    this.log = []
    this.time = 0
    this.score = 0
    this.ballNum = 1
    this.hitTimes.clear()
    this.lights = { laneA: false, laneB: false, laneC: false, ramp: false }
    this.lightShow = null
    this.respawn()
  }
}
