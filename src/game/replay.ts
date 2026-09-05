import { Game } from './state'

/**
 * Input recording and headless replay. The engine is deterministic given a
 * seed and a fixed timestep, so a seed plus a timestamped button log is a
 * complete reproduction of a game — a stuck ball seen in the browser becomes a
 * regression test by pasting the dump.
 */
export type InputEvent =
  | { t: number; kind: 'flipper'; side: 'left' | 'right'; pressed: boolean }
  | { t: number; kind: 'plunger'; pressed: boolean }

export interface Replay {
  seed: number
  log: InputEvent[]
}

export const REPLAY_DT = 1 / 1000

/** Replays a recording step-for-step. `onStep` runs after every step, for assertions. */
export function replay(
  rec: Replay,
  until: number,
  onStep?: (game: Game, i: number) => void,
): Game {
  const game = new Game(rec.seed)
  const steps = Math.ceil(until / REPLAY_DT)
  let next = 0
  for (let i = 0; i < steps; i++) {
    // Events are applied when the recorded time is reached, before the step
    // that follows it — matching where the browser's handlers would land.
    while (next < rec.log.length && rec.log[next].t <= game.time) {
      apply(game, rec.log[next++])
    }
    game.step(REPLAY_DT)
    onStep?.(game, i)
  }
  return game
}

function apply(game: Game, ev: InputEvent): void {
  if (ev.kind === 'flipper') game.setFlipper(ev.side, ev.pressed)
  else game.setPlunger(ev.pressed)
}

export function dump(game: Game): string {
  return JSON.stringify({ seed: game.seed, log: game.log } satisfies Replay)
}
