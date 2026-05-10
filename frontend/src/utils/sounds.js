let ctx = null

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function note(freq, { vol = 0.13, dur = 0.2, type = 'sine', at = 0, toFreq = null } = {}) {
  try {
    const ac = audio()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ac.currentTime + at)
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, ac.currentTime + at + dur * 0.4)
    gain.gain.setValueAtTime(0, ac.currentTime + at)
    gain.gain.linearRampToValueAtTime(vol, ac.currentTime + at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + at + dur)
    osc.start(ac.currentTime + at)
    osc.stop(ac.currentTime + at + dur + 0.02)
  } catch (_) {}
}

function noise(dur, { vol = 0.15, at = 0, lowHz = 200, highHz = 800 } = {}) {
  try {
    const ac = audio()
    const bufLen = Math.ceil(ac.sampleRate * dur)
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1
    const src = ac.createBufferSource()
    src.buffer = buf
    const lo = ac.createBiquadFilter(); lo.type = 'highpass';  lo.frequency.value = lowHz
    const hi = ac.createBiquadFilter(); hi.type = 'lowpass';   hi.frequency.value = highHz
    const gain = ac.createGain()
    src.connect(lo); lo.connect(hi); hi.connect(gain); gain.connect(ac.destination)
    gain.gain.setValueAtTime(vol, ac.currentTime + at)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + at + dur)
    src.start(ac.currentTime + at)
  } catch (_) {}
}

// ── CLICK OPTIONS (all noise-based finger tap variations) ─────────────────────

// 1. Original finger tap — mid band, natural
export function click1() { noise(0.040, { vol: 0.35, lowHz: 300, highHz: 1200 }) }

// 2. Crisp tap — shorter, brighter band, snappier
export function click2() { noise(0.025, { vol: 0.32, lowHz: 500, highHz: 2200 }) }

// 3. Soft desk pat — longer, lower band, warmer thud
export function click3() { noise(0.058, { vol: 0.28, lowHz: 150, highHz: 650 }) }

// 4. Sharp snap — very short, wide band, punchy
export function click4() { noise(0.018, { vol: 0.42, lowHz: 400, highHz: 4000 }) }

// 5. Padded tap — mid-low with gentle tail
export function click5() { noise(0.050, { vol: 0.24, lowHz: 220, highHz: 900 }) }

// ── COMPLETE OPTIONS (coin flip / magic sparkle style) ────────────────────────

// 1. Coin flip — two quick high notes, second held
export function complete1() {
  note(1047, { vol: 0.15, dur: 0.08, at: 0 })
  note(1319, { vol: 0.13, dur: 0.25, at: 0.07 })
}

// 2. Magic sparkle — fast descend then resolve up
export function complete2() {
  [1568, 1319, 1047, 784, 1047].forEach((f, i) => note(f, { vol: 0.11, dur: 0.18, at: i * 0.06 }))
}

// 3. Shimmer rise — three quick ascending notes, short and bright
export function complete3() {
  [784, 1047, 1568].forEach((f, i) => note(f, { vol: 0.13, dur: 0.22, at: i * 0.075 }))
}

// 4. Fairy skip — two pairs jumping up an octave each time
export function complete4() {
  note(784,  { vol: 0.12, dur: 0.10, at: 0.00 })
  note(1047, { vol: 0.13, dur: 0.10, at: 0.08 })
  note(1319, { vol: 0.12, dur: 0.10, at: 0.16 })
  note(1760, { vol: 0.10, dur: 0.30, at: 0.24 })
}

// 5. Pixie trail — rapid five-note sparkle, high and airy
export function complete5() {
  [1319, 1568, 1047, 1760, 1319].forEach((f, i) => note(f, { vol: 0.10, dur: 0.16, at: i * 0.055 }))
}

// ── ACTIVE SELECTIONS ────────────────────────────────────────────────────────
export const playClick    = click1
export function playComplete() {
  Math.random() < 0.5 ? complete1() : complete3()
}
