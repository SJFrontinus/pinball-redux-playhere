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
  | 'rollover' | 'ramp' | 'bonus' | 'capture' | 'kick' | 'spin' | 'target' | 'drop' | 'kickback' | 'rotor'
export type LightId = 'laneA' | 'laneB' | 'laneC' | 'ramp' | 'kickback'
/** Where points came from; drives lamps, callouts and the end-of-ball bonus. */
export type ScoreSource =
  | 'bumper' | 'sling' | 'post' | 'rollover' | 'lanes' | 'ramp' | 'rampLit' | 'kickout' | 'spinner' | 'standup' | 'drop' | 'bank' | 'outlane' | 'endOfBall'

const BUMPER_KICK = 380
const SLING_KICK = 320
/**
 * Slingshots face each other, and a fixed kick along a flat face sent the ball
 * back on the same line every time — measured runs of up to 22 consecutive
 * sling hits with nothing else scored in between. Varying the kick strength
 * breaks that limit cycle: measured over 20 games it cuts runs of six or more
 * from 26 to 17 and the longest run from 20 to 13. Jittering the kick *angle*
 * instead was tried and measured worse (38 runs) — it sometimes aims the ball
 * more squarely at the opposite sling. Seeded, so the headless game stays
 * deterministic.
 */
const SLING_KICK_OCTAVES = 1.5 // sweep
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
/** Left outlane kickback: the zone that triggers it, and the shot it fires. */
const KICKBACK_ZONE = { yMin: 858, xMin: 90, xMax: 155 }
const KICKBACK_SPEED = 1200
/**
 * Hazards arm progressively, indexed by ball number: off, on, stronger.
 * Both are well under gravity (1150), so neither can hold the ball up or
 * overpower a flipper save — they steer, they do not seize.
 */
const ROTOR_RATE = [0, 6, 10]
/**
 * Charybdis. The pull is deliberately far above gravity: only its *upward*
 * component is capped (WHIRL_MAX_LIFT), so the field steers hard sideways
 * without ever lifting the ball. The swirl is kept low for the same reason —
 * at 1250 it spun the ball up tangentially and the orbit itself lofted it
 * 223 px, which is both wrong for a whirlpool and a ball-keeper.
 */
const WHIRL_PULL = [0, 1400, 2400]
const WHIRL_SWIRL = [0, 250, 450]
/**
 * Ceiling on the field's *upward* acceleration. Gravity is 1150, and at full
 * strength the inward pull exceeds it, so a ball below the centre was lifted
 * 174 px — Charybdis levitating the ball. Clamping only the upward component
 * keeps the lateral steer, which is the part that reads as a whirlpool, while
 * guaranteeing the ball always falls through.
 */
const WHIRL_MAX_LIFT = 700
/**
 * Charybdis surges rather than running constantly: it alternates dormant and
 * running spells of the same 6-12 s range, so it is live roughly half the time.
 * Both durations are drawn from the seeded generator, so the headless game
 * stays deterministic. It always starts a ball dormant, so it never ambushes
 * the plunge.
 */
const WHIRL_OFF_TIME = [6, 12]
const WHIRL_ON_TIME = [6, 12]
/** Radians per second the drawn arcs turn while it is running. */
const WHIRL_SPIN_RATE = 0.9
/** Scoring events that earn an end-of-ball bonus unit (per-revolution spinner excluded). */
const BONUS_SOURCES = new Set<ScoreSource>([
  'rollover', 'lanes', 'ramp', 'rampLit', 'kickout', 'standup', 'drop', 'bank',
])
const BONUS_PER_UNIT = 250
const KICKBACK_ANGLE = (-95 * Math.PI) / 180 // straight up the outlane barrel
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
  lights: Record<LightId, boolean> = {
    laneA: false, laneB: false, laneC: false, ramp: false, kickback: true,
  }
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
  /** The left outlane kickback fires once per ball while armed. */
  kickbackArmed = true
  /** Scoring events banked this ball; paid out at drain. */
  bonusUnits = 0
  /** Whether Charybdis is currently running. Cycles on a seeded schedule. */
  whirlOn = false
  /** Next time the whirlpool flips state. */
  private whirlToggleAt = 0
  /** Arc rotation, advanced only while running so it freezes when it stops. */
  whirlPhase = 0
  onSfx: (name: SfxName) => void = () => {}
  /** The only source of randomness in the game (constraint: determinism). */
  rng: Rng
  /** Input log for replay; recorded only while `record` is set. */
  record = false
  log: InputEvent[] = []

  constructor(readonly seed: number = DEFAULT_SEED) {
    this.rng = new Rng(seed)
    this.whirlToggleAt = this.rng.range(WHIRL_OFF_TIME[0], WHIRL_OFF_TIME[1])
    this.ball = makeBall({ ...this.table.spawn })
  }

  /** Rewards ramp with the hazards, so ball 3 is where the points are. */
  get multiplier(): number {
    return this.ballNum
  }

  /** Single scoring entry point. Every point on the table passes through here. */
  award(points: number, source: ScoreSource): void {
    this.score += points * this.multiplier
    if (BONUS_SOURCES.has(source)) this.bonusUnits++
  }

  /** 0 on ball 1, rising with each ball. Drives hazard strength and their rendering. */
  get hazardLevel(): number {
    return Math.min(this.ballNum, 3) - 1
  }

  /** Hazard strength for the ball in play. */
  private hazard<T>(schedule: T[]): T {
    return schedule[Math.min(this.ballNum, schedule.length) - 1]
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

    this.table.rotor.rate = this.hazard(ROTOR_RATE)
    this.table.rotor.update(dt)

    if (this.capture) {
      this.holdCaptured()
      return
    }

    this.updateWhirlpool(dt)
    this.applyWhirlpool(dt)

    const colliders: Collider[] =
      this.ball.layer === 'ramp'
        ? this.table.rampWalls
        : [
            ...this.table.statics.filter((c) => c.active !== false),
            ...this.table.bumpers,
            ...this.table.flippers.map((f) => f.collider()),
            ...(this.table.rotor.rate > 0 ? this.table.rotor.colliders() : []),
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

  /** Runs the on/off cycle and the arc rotation. */
  private updateWhirlpool(dt: number): void {
    if (this.hazard(WHIRL_PULL) === 0) {
      this.whirlOn = false
      return
    }
    if (this.time >= this.whirlToggleAt) {
      this.whirlOn = !this.whirlOn
      const span = this.whirlOn ? WHIRL_ON_TIME : WHIRL_OFF_TIME
      this.whirlToggleAt = this.time + this.rng.range(span[0], span[1])
    }
    if (this.whirlOn) this.whirlPhase += WHIRL_SPIN_RATE * dt
  }

  /**
   * Charybdis: an inward pull plus a tangential swirl, falling off linearly to
   * nothing at the rim. The swirl is what makes it read as a whirlpool rather
   * than tilted gravity — it bends the ball's path instead of opposing the
   * flippers head-on.
   */
  private applyWhirlpool(dt: number): void {
    const pull = this.hazard(WHIRL_PULL)
    if (!this.whirlOn || pull === 0 || this.ball.layer !== 'main') return
    const w = this.table.whirlpool
    const dx = w.c.x - this.ball.p.x
    const dy = w.c.y - this.ball.p.y
    const d = Math.hypot(dx, dy)
    if (d > w.r || d < 1e-3) return
    // Plateau: full strength across the inner ~55% of the radius, then ramping
    // to nothing at the rim. A plain linear falloff put the force where the
    // ball spends least time, and steered a falling ball only ~6 px.
    const falloff = Math.min(1, 2.2 * (1 - d / w.r))
    const ux = dx / d
    const uy = dy / d
    const swirl = this.hazard(WHIRL_SWIRL)
    // Inward unit vector (ux, uy); its perpendicular (-uy, ux) gives the swirl.
    const ax = (ux * pull - uy * swirl) * falloff
    const ay = (uy * pull + ux * swirl) * falloff
    this.ball.v = add(this.ball.v, v2(ax * dt, Math.max(ay, -WHIRL_MAX_LIFT) * dt))
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
      // Left outlane kickback: one save per ball, on the way down the channel.
      if (
        this.kickbackArmed &&
        b.p.y > KICKBACK_ZONE.yMin &&
        b.p.x > KICKBACK_ZONE.xMin &&
        b.p.x < KICKBACK_ZONE.xMax
      ) {
        this.kickbackArmed = false
        this.lights.kickback = false
        b.v = v2(Math.cos(KICKBACK_ANGLE) * KICKBACK_SPEED, Math.sin(KICKBACK_ANGLE) * KICKBACK_SPEED)
        this.award(250, 'outlane')
        this.lightShow = { t: this.time, x: 120, y: 870 }
        this.onSfx('kickback')
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
      const kick = SLING_KICK * 2 ** this.rng.range(-SLING_KICK_OCTAVES, SLING_KICK_OCTAVES)
      this.ball.v = add(this.ball.v, scale(ev.n, kick))
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
    } else if (id === 'rotor' && !onCooldown && ev.impact > 100) {
      this.hitTimes.set(id, this.time)
      this.onSfx('rotor')
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
    if (this.bonusUnits > 0) this.award(this.bonusUnits * BONUS_PER_UNIT, 'endOfBall')
    this.bonusUnits = 0
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
    this.whirlOn = false
    this.whirlToggleAt = this.time + this.rng.range(WHIRL_OFF_TIME[0], WHIRL_OFF_TIME[1])
    this.kickbackArmed = true
    this.lights.kickback = true
    this.spinner = { angle: 0, rate: 0, revs: 0 }
    this.capture = null
    this.kickoutArmedAt = 0
    this.ball = makeBall({ ...this.table.spawn })
    this.phase = 'ready'
    this.charge = 0
  }

  restart(): void {
    this.whirlPhase = 0
    this.bonusUnits = 0
    this.resetBank()
    this.rng = new Rng(this.seed)
    this.log = []
    this.time = 0
    this.score = 0
    this.ballNum = 1
    this.hitTimes.clear()
    this.lights = { laneA: false, laneB: false, laneC: false, ramp: false, kickback: true }
    this.lightShow = null
    this.respawn()
  }
}
