import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'

// ── Half-life size decay ─────────────────────────────────────────────────────
// size(age) = endSize + (baseSize - endSize) * 0.5^(age/halfLife)
// Approaches endSize asymptotically; never disappears.
const BASE_SIZE_PX     = 48
const END_SIZE_PX      = 10
const HALF_LIFE_MONTHS = 6
const MONTH_MS         = 30.44 * 24 * 60 * 60 * 1000

function ageMonths(iso) {
  return (Date.now() - new Date(iso).getTime()) / MONTH_MS
}

function sizeForAge(months) {
  const factor = Math.pow(0.5, months / HALF_LIFE_MONTHS)
  return END_SIZE_PX + (BASE_SIZE_PX - END_SIZE_PX) * factor
}

// ── Deterministic PRNG (mulberry32) — keyed by task id so each star's ray
// length variance and rotation are stable across renders.
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function colorFor(by, on) {
  if (!on) return '#ffffff'
  if (by === 'person1')  return 'var(--person1)'
  if (by === 'person2')  return 'var(--person2)'
  return 'var(--together)'
}

// ── Halo gradients shared across all stars ───────────────────────────────────
function HaloDefs() {
  // Four gradients so a halo can match its star color (white + 3 person tints).
  const halos = [
    { id: 'halo-w', stop: '255,255,255' },
    { id: 'halo-p1', stop: '124,58,237' },   // purple
    { id: 'halo-p2', stop: '245,158,11' },   // orange
    { id: 'halo-t',  stop: '236,72,153' },   // pink
  ]
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        {halos.map(h => (
          <radialGradient key={h.id} id={h.id} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={`rgb(${h.stop})`} stopOpacity="0.55" />
            <stop offset="60%"  stopColor={`rgb(${h.stop})`} stopOpacity="0.12" />
            <stop offset="100%" stopColor={`rgb(${h.stop})`} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
    </svg>
  )
}

function haloId(by, on) {
  if (!on) return 'halo-w'
  if (by === 'person1') return 'halo-p1'
  if (by === 'person2') return 'halo-p2'
  return 'halo-t'
}

// ── The star itself: 8 rays in alternating long/short pattern, long ones wave-curved ──
function WaveStar({ size, color, halo, seed }) {
  const rng = useMemo(() => mulberry32(seed >>> 0), [seed])
  const { rotation, lengths, lean } = useMemo(() => {
    const _rot = rng() * 360
    // Per-ray length jitter so individual stars look different.
    const longJ  = [0, 1, 2, 3].map(() => 0.78 + rng() * 0.42)
    const shortJ = [0, 1, 2, 3].map(() => 0.75 + rng() * 0.45)
    const _lean  = [0, 1, 2, 3].map(() => (rng() > 0.5 ? 1 : -1))
    const _lengths = []
    for (let i = 0; i < 8; i++) {
      const isLong = i % 2 === 0
      const idx    = i >> 1
      const baseFrac = isLong ? 0.46 : 0.26
      const j = (isLong ? longJ : shortJ)[idx]
      _lengths.push(baseFrac * j)
    }
    return { rotation: _rot, lengths: _lengths, lean: _lean }
  }, [rng])

  const half = 20
  const rays = []
  for (let i = 0; i < 8; i++) {
    const angle = i * 45
    const len = lengths[i] * half * 2  // viewBox is -20..20 (40 units)
    const isLong = i % 2 === 0
    if (isLong) {
      const idx = i >> 1
      const sw = len * 0.045 * lean[idx]
      // Two-bend wavy path pointing "up" (-y), then rotated to its angle.
      const d = `M 0,0 Q ${sw},${-len * 0.33} 0,${-len * 0.55} Q ${-sw},${-len * 0.78} 0,${-len}`
      rays.push(
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="1.3"
              strokeLinecap="round" transform={`rotate(${angle})`} />
      )
    } else {
      rays.push(
        <line key={i} x1="0" y1="0" x2="0" y2={-len} stroke={color}
              strokeWidth="1.05" strokeLinecap="round" opacity="0.85"
              transform={`rotate(${angle})`} />
      )
    }
  }

  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40"
         style={{ transform: `rotate(${rotation}deg)`, display: 'block', overflow: 'visible' }}>
      <circle cx="0" cy="0" r="18" fill={`url(#${halo})`} />
      <g>{rays}</g>
      <circle cx="0" cy="0" r="2.4" fill={color} />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Stars() {
  const [completions, setCompletions] = useState(null)
  const [colorByPerson, setColorByPerson] = useState(false)

  useEffect(() => {
    api.allCompletions()
      .then(setCompletions)
      .catch(() => setCompletions([]))
  }, [])

  // Random positions assigned once per component mount (don't re-randomize
  // when the color toggle changes). Re-randomize each time the user opens
  // the Stars tab because we don't persist coordinates.
  const placedStars = useMemo(() => {
    if (!completions) return null
    return completions.map(c => ({
      id: c.id,
      by: c.completed_by,
      at: c.completed_at,
      x: 4 + Math.random() * 92,   // % within sky; small margin so they don't clip
      y: 4 + Math.random() * 92,
    }))
  }, [completions])

  if (completions === null) {
    return <div className="page" style={{ color: 'var(--text-dim)', fontSize: 11 }}>loading...</div>
  }

  const counts = completions.reduce((acc, c) => {
    acc.total += 1
    acc[c.completed_by] = (acc[c.completed_by] || 0) + 1
    return acc
  }, { total: 0 })

  return (
    <div className="stars-page">
      <HaloDefs />

      <div className="stars-toolbar">
        <div className="stars-count">
          <b style={{ fontSize: 14 }}>{counts.total}</b>
          {colorByPerson && (
            <span style={{ marginLeft: 14, fontSize: 11, color: 'var(--text-dim)' }}>
              <span style={{ color: 'var(--person1)' }}>● {counts.person1 || 0}</span>{'  '}
              <span style={{ color: 'var(--person2)' }}>● {counts.person2 || 0}</span>{'  '}
              <span style={{ color: 'var(--together)' }}>● {counts.together || 0}</span>
            </span>
          )}
        </div>
        <label className="stars-toggle">
          <input type="checkbox" checked={colorByPerson}
                 onChange={e => setColorByPerson(e.target.checked)} />
          <span>color by person</span>
        </label>
      </div>

      <div className="stars-sky">
        {placedStars.map(s => {
          const size  = sizeForAge(ageMonths(s.at))
          const color = colorFor(s.by, colorByPerson)
          const halo  = haloId(s.by, colorByPerson)
          return (
            <div key={s.id} className="stars-star" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <WaveStar size={size} color={color} halo={halo} seed={s.id} />
            </div>
          )
        })}
        {placedStars.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: 'rgba(255,255,255,0.45)', fontSize: 12, fontStyle: 'italic',
          }}>
            no completions yet — go do a chore
          </div>
        )}
      </div>
    </div>
  )
}
