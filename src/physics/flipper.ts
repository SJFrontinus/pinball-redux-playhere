import { Vec2, v2, add, sub, scale } from './vec2'
import { CapsuleCollider, MAT } from './colliders'

/**
 * A flipper is a kinematically driven capsule rotating about a pivot. Its
 * angular velocity determines the surface velocity at the contact point
 * (ω × r), which the collision response transfers to the ball — that transfer
 * is what makes a flipper launch rather than merely deflect.
 */
export class Flipper {
  angle: number
  angVel = 0
  pressed = false

  constructor(
    readonly pivot: Vec2,
    readonly length: number,
    readonly restAngle: number,
    readonly raisedAngle: number,
    /** Angular speed in rad/s while moving. */
    readonly omega = 34,
    readonly thickness = 11,
  ) {
    this.angle = restAngle
  }

  update(dt: number): void {
    const target = this.pressed ? this.raisedAngle : this.restAngle
    const delta = target - this.angle
    if (Math.abs(delta) < 1e-6) {
      this.angVel = 0
      return
    }
    this.angVel = Math.sign(delta) * this.omega
    const step = this.angVel * dt
    if (Math.abs(step) >= Math.abs(delta)) {
      this.angle = target
      this.angVel = 0
    } else {
      this.angle += step
    }
  }

  tip(): Vec2 {
    return add(this.pivot, scale(v2(Math.cos(this.angle), Math.sin(this.angle)), this.length))
  }

  velocityAt(p: Vec2): Vec2 {
    const r = sub(p, this.pivot)
    return scale(v2(-r.y, r.x), this.angVel)
  }

  collider(): CapsuleCollider {
    return {
      kind: 'capsule',
      a: this.pivot,
      b: this.tip(),
      r: this.thickness,
      mat: MAT.flipper,
      id: 'flipper',
      velocityAt: (p) => this.velocityAt(p),
    }
  }
}
