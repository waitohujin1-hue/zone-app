let ctx: AudioContext | null = null

function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

// Short two-note chime with an attack/decay envelope (never jump gain.value
// directly -- see BgmPlayer's volume fix for why that clicks/pops).
function playTone(startAt: number, freq: number, durationSec: number, peakGain: number): void {
  const audioCtx = getContext()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.02)
  gain.gain.setTargetAtTime(0, startAt + durationSec * 0.5, durationSec * 0.3)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(startAt)
  osc.stop(startAt + durationSec + 0.5)
}

/** Two ascending notes -- signals a break (or long break) is starting. */
export function playBreakChime(): void {
  const now = getContext().currentTime
  playTone(now, 660, 0.5, 0.15)
  playTone(now + 0.18, 880, 0.6, 0.15)
}

/** Two descending notes -- signals work is starting again. */
export function playWorkChime(): void {
  const now = getContext().currentTime
  playTone(now, 880, 0.5, 0.15)
  playTone(now + 0.18, 660, 0.6, 0.15)
}

/** Three ascending notes -- signals the whole session finished. */
export function playSessionEndChime(): void {
  const now = getContext().currentTime
  playTone(now, 523, 0.4, 0.15)
  playTone(now + 0.16, 659, 0.4, 0.15)
  playTone(now + 0.32, 784, 0.7, 0.15)
}
