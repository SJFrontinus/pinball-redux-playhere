# Pinball Redux

A web pinball game with fully custom physics. TypeScript, Canvas 2D, Web Audio — zero runtime dependencies.

Plunger with a charge-based skill shot, two flippers, three pop bumpers, slingshots, A-B-C rollover lanes, an elevated ramp, rubber posts, light shows, ball trails, synthesized sound, and a 3-ball game with scoring.

## Running it

```sh
bun install
bun run dev        # open the printed localhost URL
```

`bun run dev -- --host` exposes it on your LAN for playing on a phone.

Other scripts: `bun test` (physics + full-game simulation tests), `bun run typecheck`, `bun run build`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Left / right flipper | `Z` / `/`, or the Shift keys | Hold left / right half of the screen |
| Plunger | Hold `Space` or `↓`, release to launch | Hold the screen, release to launch |
| Restart after game over | `R` | Tap |
| Physics debug overlay | `D` | — |

The plunger is a skill shot: a full-power launch orbits the top arc into lane **A**; a soft plunge drops into lane **C**; too soft and the ball returns down the lane. Completing A-B-C pays a bonus and lights the ramp — a lit ramp pays 2,000.

## Why custom physics

Pinball is one of the rare games where writing your own physics is the sound engineering choice, not just the fun one. General-purpose 2D engines assume many bodies at moderate speeds with discrete time steps; pinball violates both assumptions. The ball travels several times its own diameter per frame (discrete stepping tunnels through walls), and flippers are kinematically driven rotating bodies that impulse solvers handle badly — they come out mushy or explosive.

But pinball has exactly **one dynamic body**. Everything else is static or kinematic, so the whole problem collapses to closed-form math. This is how the serious pinball simulators do it.

### How it works

- **Fixed timestep, 1 kHz substeps** (`src/loop.ts`, `src/physics/world.ts`). Rendering runs at whatever rate `requestAnimationFrame` delivers; physics is deterministic.
- **Continuous (swept) collision** (`src/physics/collision.ts`). Each substep solves the closed-form time of impact of the moving circle against segments, circles, and capsules — a quadratic per collider — advances to the earliest contact, bounces, and repeats until the substep is consumed. The ball cannot tunnel at any speed (there's a test that fires it at 100,000 px/s into a wall).
- **Flippers transfer surface velocity** (`src/physics/flipper.ts`). A flipper is a rotating capsule; on contact the ball receives the flipper's surface velocity at the contact point (ω × r) blended with the reflection. That transfer — not a plain bounce — is what makes a flip *launch* the ball, and it varies along the flipper's length like the real thing.
- **Coulomb friction** (`src/physics/world.ts`). Tangential impulse is capped at μ times the normal impulse, with a small rolling-resistance coefficient for resting contact. (The first version removed a fixed fraction of tangential velocity per contact — at 1 kHz resting contact that bleeds ~4% of speed a thousand times per second, and the ball stalled on every wall it touched.)
- **A penetration-recovery pass** gives stable resting contact and lets a moving flipper strike a stationary ball.
- **Collision layers for the ramp** (`src/game/state.ts`). The ball carries a `layer`; entering the ramp switches its collider set to the ramp's guide walls only, so it passes over bumpers and lane dividers while elevated. The renderer draws it enlarged with a drop shadow, under translucent ramp walls.
- **Table geometry as data** (`src/table/layout.ts`). Arcs are polylines; the shooter lane curves into the main arc tangentially (radius chosen so the lane narrows into the channel with no lip), which is why the plunged ball orbits predictably instead of chord-bouncing.

### Layout

```
src/
  loop.ts            fixed-timestep accumulator loop
  physics/           vec2, ball, colliders, swept collision, world step, flipper
  table/layout.ts    all table geometry and zones, as data
  game/state.ts      game state machine, scoring, lights, triggers
  render/            canvas vector renderer + HUD
  audio/sfx.ts       synthesized Web Audio effects (no assets)
  debug.ts           overlay: velocity vector, contacts, substep count (D key)
tests/               collision math, feature tests, seeded full-game simulation
```

## Testing

`bun test` runs three suites: unit tests for the time-of-impact math (hit, miss, graze, overlap, extreme-speed tunneling), feature tests (ramp entry/fallback/bonus, rollover lanes, cooldowns), and a seeded full-game simulation that plays a complete 3-ball game headless — asserting the ball never leaves the table, never gets stuck, and the game reaches game over. The whole suite is a few hundred milliseconds; the sim plays a full game in ~100 ms because the physics has no rendering dependency.

The game object is exposed as `window.game` in the browser console for poking and scripted play.
