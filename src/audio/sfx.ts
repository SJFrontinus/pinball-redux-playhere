import { SfxName } from '../game/state'

let ctx: AudioContext | null = null

/** Browsers require a user gesture before audio can start. */
export function unlockAudio(): void {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.25,
  freqEnd?: number,
  delay = 0,
): void {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export function playSfx(name: SfxName): void {
  switch (name) {
    case 'flipper':
      blip(150, 0.05, 'square', 0.2)
      break
    case 'bumper':
      blip(660, 0.1, 'triangle', 0.35)
      blip(1320, 0.06, 'sine', 0.2)
      break
    case 'sling':
      blip(330, 0.07, 'square', 0.28)
      break
    case 'post':
      blip(900, 0.035, 'sine', 0.18)
      break
    case 'wall':
      blip(220, 0.03, 'sine', 0.12)
      break
    case 'launch':
      blip(180, 0.35, 'sawtooth', 0.3, 900)
      break
    case 'drain':
      blip(500, 0.5, 'triangle', 0.3, 90)
      break
    case 'rollover':
      blip(1200, 0.05, 'sine', 0.22)
      break
    case 'ramp':
      blip(300, 0.3, 'sawtooth', 0.22, 1400)
      break
    case 'capture':
      blip(420, 0.18, 'triangle', 0.28, 140)
      break
    case 'kick':
      blip(120, 0.12, 'square', 0.3, 480)
      blip(1600, 0.04, 'sine', 0.15)
      break
    case 'spin':
      blip(2600, 0.018, 'square', 0.1)
      break
    case 'target':
      blip(1100, 0.05, 'triangle', 0.25)
      break
    case 'drop':
      blip(700, 0.08, 'square', 0.25, 350)
      break
    case 'bonus':
      blip(660, 0.09, 'square', 0.24)
      blip(880, 0.09, 'square', 0.24, undefined, 0.09)
      blip(1320, 0.14, 'square', 0.26, undefined, 0.18)
      break
  }
}
