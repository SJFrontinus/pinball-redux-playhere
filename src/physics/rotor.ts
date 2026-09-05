import { Vec2, v2, add, sub, scale } from './vec2'
import { CapsuleCollider, Material, MAT } from './colliders'

/**
 * A continuously spinning multi-arm bat — Scylla. Same kinematic surface as a
 * flipper (ω × r transfers into the ball), but driven by a scripted rate
 * instead of a button, so it is not part of `Table.flippers`: `setFlipper`
 * fans out by side and would otherwise drive the rotor from the buttons.
 * A rate of 0 means the hazard is off and its arms leave the world entirely.
 */
export class Rotor {
  angle = 0
  /** Angular velocity in rad/s. Set from the ball number; 0 disables. */
  rate = 0

  constructor(
    readonly pivot: Vec2,
    readonly arms: number,
    readonly length: number,
    readonly thickness = 8,
    readonly mat: Material = MAT.rotor,
  ) {}

  update(dt: number): void {
    this.angle = (this.angle + this.rate * dt) % (Math.PI * 2)
  }

  velocityAt(p: Vec2): Vec2 {
    const r = sub(p, this.pivot)
    return scale(v2(-r.y, r.x), this.rate)
  }

  /** One capsule per arm, radiating from the pivot at equal angles. */
  colliders(): CapsuleCollider[] {
    const out: CapsuleCollider[] = []
    for (let i = 0; i < this.arms; i++) {
      const a = this.angle + (i * 2 * Math.PI) / this.arms
      const dir = v2(Math.cos(a), Math.sin(a))
      out.push({
        kind: 'capsule',
        a: this.pivot,
        b: add(this.pivot, scale(dir, this.length)),
        r: this.thickness,
        mat: this.mat,
        id: 'rotor',
        velocityAt: (p) => this.velocityAt(p),
      })
    }
    return out
  }
}
