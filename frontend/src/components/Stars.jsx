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

// Person colors as raw values (so they can drive an inline SVG gradient stop too).
const PERSON_COLOR = {
  person1: '#7c3aed',  // purple
  person2: '#f59e0b',  // orange
  together: '#ec4899', // pink
}

function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return ((h % 360) + 360) % 360
}

function categoryColor(category) {
  // Bright, well-saturated colors on a dark background; lightness chosen
  // to read clearly without going washed-out.
  return `hsl(${hashHue(category || '')}, 70%, 65%)`
}

function colorFor(c, mode) {
  if (mode === 'person')   return PERSON_COLOR[c.by] || '#ffffff'
  if (mode === 'category') return categoryColor(c.category)
  return '#ffffff'
}

const MODE_ORDER = ['none', 'person', 'category']
const MODE_LABEL = { none: 'no color', person: 'by person', category: 'by category' }

// ── The star itself: 8 rays in alternating long/short pattern, long ones wave-curved ──
function WaveStar({ size, color, seed }) {
  const haloId = `h${seed}`
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
      <defs>
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={color} stopOpacity="0.55" />
          <stop offset="60%"  stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="0" cy="0" r="18" fill={`url(#${haloId})`} />
      <g>{rays}</g>
      <circle cx="0" cy="0" r="2.4" fill={color} />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Stars() {
  const [completions, setCompletions] = useState(null)
  const [colorMode, setColorMode] = useState('none')

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
      category: c.category,
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

  function cycleMode() {
    setColorMode(m => MODE_ORDER[(MODE_ORDER.indexOf(m) + 1) % MODE_ORDER.length])
  }

  const categoryCounts = useMemo(() => {
    if (colorMode !== 'category') return null
    const m = {}
    completions.forEach(c => { m[c.category] = (m[c.category] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [completions, colorMode])

  return (
    <div className="stars-page">
      <div className="stars-toolbar">
        <div className="stars-count">
          <b style={{ fontSize: 14 }}>{counts.total}</b>
          {colorMode === 'person' && (
            <span style={{ marginLeft: 14, fontSize: 11, color: 'var(--text-dim)' }}>
              <span style={{ color: 'var(--person1)' }}>● {counts.person1 || 0}</span>{'  '}
              <span style={{ color: 'var(--person2)' }}>● {counts.person2 || 0}</span>{'  '}
              <span style={{ color: 'var(--together)' }}>● {counts.together || 0}</span>
            </span>
          )}
          {colorMode === 'category' && categoryCounts && (
            <span style={{ marginLeft: 14, fontSize: 11, color: 'var(--text-dim)', display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
              {categoryCounts.map(([cat, n]) => (
                <span key={cat} style={{ color: categoryColor(cat) }}>● {n}</span>
              ))}
            </span>
          )}
        </div>
        <button className="stars-toggle" type="button" onClick={cycleMode}>
          {MODE_LABEL[colorMode]}
        </button>
      </div>

      <div className="stars-sky">
        {placedStars.map(s => {
          const size  = sizeForAge(ageMonths(s.at))
          const color = colorFor(s, colorMode)
          return (
            <div key={s.id} className="stars-star" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <WaveStar size={size} color={color} seed={s.id} />
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
