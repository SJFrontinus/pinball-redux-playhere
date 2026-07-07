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
): void {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
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
  }
}
