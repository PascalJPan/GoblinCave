import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../api'
import { playComplete } from '../utils/sounds'
import { usePersons } from '../context/PersonContext'
import CloudCard from './CloudCard'
import CloudModal from './CloudModal'
import Character from './Character'

const STARS = [
  [120,45],[230,28],[340,72],[460,18],[555,58],[660,35],[775,22],[870,68],[960,42],
  [145,108],[390,88],[720,95],[55,125],[310,65],[640,102],[920,58],[195,38],
  [480,130],[800,42],[1050,75],[1280,30],[1420,85],[1520,50],[1360,110],[1180,62],
]

// [cx, baseY, height, halfWidth, apexOffset]
const TREES = [
  [75,  800, 80, 20, -3],
  [125, 807, 60, 18,  4],
  [162, 812, 74, 22, -2],
  [342, 810, 88, 23,  2],
  [388, 807, 54, 16, -4],
  [625, 808, 70, 21,  3],
  [692, 812, 96, 25, -5],
  [745, 807, 56, 17,  2],
  [920, 800, 84, 22, -3],
  [1042,803, 68, 20,  4],
  [1092,810, 90, 24, -2],
  [1138,814, 52, 16,  3],
  [1348,799, 76, 21, -4],
  [1438,804, 64, 19,  2],
  [1515,812, 80, 22, -3],
  [1555,809, 46, 15,  4],
]

const PERSON_COLORS = { person1: '#7c3aed', person2: '#f59e0b', together: '#ec4899' }

// 0=day, 1=dusk, 2=lighter night, 3=full night, 4=deep cold dark (4+ tasks)
const PALETTES = [
  { // 0 tasks — beautiful pastel day: light blue sky, lush green mountains
    sky: ['#1a5fa8', '#3d8ac8', '#62abe0', '#80c0e8', '#60b090'],
    bloom: '#80c8e0', bloomOp: 0.28,
    farMtn: '#3a7040', nearMtn: '#2c5a30', tree: '#3a7038',
    gnd0: '#2a4a28', gnd1: '#1a3018',
    starOp: 0,
  },
  { // 1 task — dusk: violet-indigo sky, warm magenta horizon, teal-green mountains
    sky: ['#1a1858', '#241e70', '#2e2878', '#4a1e58', '#6a2438'],
    bloom: '#8a3040', bloomOp: 0.38,
    farMtn: '#2a4030', nearMtn: '#1e3022', tree: '#283c28',
    gnd0: '#1c2c1c', gnd1: '#121e12',
    starOp: 0.22,
  },
  { // 2 tasks — deep blue night, vivid red-orange glow at horizon
    sky: ['#0c0e28', '#121638', '#1a1848', '#401828', '#702018'],
    bloom: '#903020', bloomOp: 0.42,
    farMtn: '#1a2214', nearMtn: '#10180c', tree: '#182012',
    gnd0: '#161410', gnd1: '#0c0e0a',
    starOp: 0.35,
  },
  { // 3 tasks — rich indigo night, warm scarlet horizon bloom
    sky: ['#080a20', '#0e1030', '#141438', '#401228', '#701808'],
    bloom: '#a02808', bloomOp: 0.52,
    farMtn: '#121a0c', nearMtn: '#0a100a', tree: '#101608',
    gnd0: '#101408', gnd1: '#080c06',
    starOp: 0.45,
  },
  { // 4+ tasks — deep cold indigo-black, icy violet tint
    sky: ['#04040e', '#060818', '#090a20', '#0c0c28', '#0e0e30'],
    bloom: '#181640', bloomOp: 0.22,
    farMtn: '#0c0e18', nearMtn: '#080a12', tree: '#0c0e14',
    gnd0: '#0a0c10', gnd1: '#06070c',
    starOp: 0.60,
  },
]

function LandscapeBackground({ taskCount }) {
  const level = taskCount >= 4 ? 4 : taskCount
  const p = PALETTES[level]

  return (
    <div className="dashboard-landscape">
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={p.sky[0]} />
            <stop offset="45%"  stopColor={p.sky[1]} />
            <stop offset="72%"  stopColor={p.sky[2]} />
            <stop offset="88%"  stopColor={p.sky[3]} />
            <stop offset="100%" stopColor={p.sky[4]} />
          </linearGradient>
          <radialGradient id="horizon-bloom" cx="50%" cy="100%" r="55%">
            <stop offset="0%"   stopColor={p.bloom} stopOpacity={p.bloomOp} />
            <stop offset="100%" stopColor={p.bloom} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={p.gnd0} />
            <stop offset="100%" stopColor={p.gnd1} />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect x="0" y="0" width="1600" height="900" fill="url(#sky-grad)" />
        <rect x="0" y="0" width="1600" height="900" fill="url(#horizon-bloom)" />

        {/* Stars — fewer/dimmer as it gets brighter */}
        {STARS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.5 : 1}
            fill="white" opacity={(0.3 + (i % 5) * 0.09) * p.starOp / 0.40} />
        ))}

        {/* Far mountains */}
        <polygon
          points="0,900 0,572 85,478 170,542 240,495 320,555 520,448 630,520 720,460 780,538 980,455 1100,530 1185,475 1260,520 1340,480 1470,530 1600,505 1600,900"
          fill={p.farMtn}
        />

        {/* Near mountains */}
        <polygon
          points="0,900 0,648 150,606 280,660 380,600 445,618 510,598 700,665 850,596 960,625 1050,604 1105,614 1175,600 1360,658 1460,602 1570,638 1600,625 1600,900"
          fill={p.nearMtn}
        />

        {/* Trees */}
        {TREES.map(([cx, by, h, hw, ao], i) => (
          <polygon key={i}
            points={`${cx - hw},${by} ${cx + ao},${by - h} ${cx + hw},${by}`}
            fill={p.tree}
          />
        ))}

        {/* Ground strip — wavy rolling hill */}
        <path d="M0,900 L0,808 C80,800 200,820 360,808 C520,796 660,818 820,806 C980,794 1120,816 1280,805 C1400,797 1510,812 1600,807 L1600,900 Z" fill="url(#ground-grad)" />
      </svg>
    </div>
  )
}

function ParticleBurst({ x, y, person, onDone }) {
  const color = PERSON_COLORS[person] || '#fff'
  const particles = useMemo(() => {
    const count = 26
    return Array.from({ length: count }, (_, i) => {
      const angle = (360 / count) * i + (Math.random() - 0.5) * 30
      const dist = 90 + Math.random() * 130
      const rad = angle * Math.PI / 180
      return {
        dx: Math.cos(rad) * dist,
        dy: Math.sin(rad) * dist,
        size: 7 + Math.random() * 10,
        color: i % 3 === 0 ? '#ffffff' : color,
        dur: 1.0 + Math.random() * 0.6,
        delay: Math.random() * 0.15,
      }
    })
  }, [color])

  useEffect(() => {
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 9999 }}>
      {particles.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: p.color,
          '--dx': `${p.dx}px`,
          '--dy': `${p.dy}px`,
          animation: `particle-fly ${p.dur}s ${p.delay}s ease-out forwards`,
          transform: 'translate(-50%, -50%)',
        }} />
      ))}
    </div>
  )
}

function TogetherZone({ isDragging, onDrop }) {
  const [over, setOver] = useState(false)
  const [eating, setEating] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOver(true)
  }

  function handleDragLeave() { setOver(false) }

  async function handleDrop(e) {
    e.preventDefault()
    setOver(false)
    const instanceId = parseInt(e.dataTransfer.getData('instanceId'), 10)
    if (!instanceId) return
    setEating(true)
    try {
      await onDrop(instanceId, 'together', e.clientX, e.clientY)
    } finally {
      setTimeout(() => setEating(false), 600)
    }
  }

  return (
    <div
      className={`together-zone ${isDragging ? 'active' : ''} ${over ? 'drag-over' : ''} ${eating ? 'eating' : ''}`}
      data-dropzone="together"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="together-zone-label">
        {eating ? '♡' : isDragging ? '♡' : ''}
      </span>
    </div>
  )
}

function Column({ person, clouds, onDrop, onDragStart, onDragEnd, onOpen, hidden, onTouchDrop }) {
  return (
    <div className={`column ${person}`} style={hidden ? { display: 'none' } : {}}>
      <div className="clouds-area">
        {clouds.map(inst => (
          <CloudCard
            key={`${inst.id}-${person}`}
            instance={inst}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onOpen={onOpen}
            onTouchDrop={onTouchDrop}
          />
        ))}
      </div>
      <Character name={person} onDrop={onDrop} />
    </div>
  )
}

export default function Dashboard() {
  const persons = usePersons()
  const [data, setData] = useState({ person1: [], person2: [] })
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [openInst, setOpenInst] = useState(null)
  const [bursts, setBursts] = useState([])
  const [mobileTab, setMobileTab] = useState(
    () => localStorage.getItem('mobileTab') || 'person1'
  )

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  function switchTab(tab) {
    setMobileTab(tab)
    localStorage.setItem('mobileTab', tab)
  }

  async function handleDrop(instanceId, completedBy, x, y) {
    if (x != null && y != null) {
      const id = Date.now() + Math.random()
      setBursts(bs => [...bs, { id, x, y, person: completedBy }])
    }
    try {
      await api.complete(instanceId, completedBy)
      playComplete()
      await load()
    } catch (e) {
      console.error('Complete failed', e)
    }
  }

  const totalTasks = (data.person1?.length || 0) + (data.person2?.length || 0)

  useEffect(() => {
    const level = totalTasks >= 4 ? 4 : totalTasks
    document.body.dataset.lightLevel = level
    return () => { delete document.body.dataset.lightLevel }
  }, [totalTasks])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-dim)', fontSize: 9 }}>loading...</div>

  const isMobile = window.innerWidth <= 768

  return (
    <>
      <div className="dashboard">
        <LandscapeBackground taskCount={totalTasks} />
        <Column person="person1" clouds={data.person1 || []}
          onDrop={handleDrop}
          onDragStart={() => setDragging(true)}
          onDragEnd={() => setDragging(false)}
          onOpen={setOpenInst}
          hidden={isMobile && mobileTab !== 'person1'}
          onTouchDrop={handleDrop} />
        <TogetherZone isDragging={dragging} onDrop={handleDrop} />
        <Column person="person2" clouds={data.person2 || []}
          onDrop={handleDrop}
          onDragStart={() => setDragging(true)}
          onDragEnd={() => setDragging(false)}
          onOpen={setOpenInst}
          hidden={isMobile && mobileTab !== 'person2'}
          onTouchDrop={handleDrop} />
      </div>

      <div className="mobile-tab-bar">
        {(['person1', 'person2']).map(p => (
          <button key={p} className={`mobile-tab ${mobileTab === p ? 'active' : ''}`}
            onClick={() => switchTab(p)}>
            {persons[p].toUpperCase()}
          </button>
        ))}
      </div>

      {bursts.map(b => (
        <ParticleBurst
          key={b.id}
          x={b.x}
          y={b.y}
          person={b.person}
          onDone={() => setBursts(bs => bs.filter(x => x.id !== b.id))}
        />
      ))}

      {openInst && (
        <CloudModal
          instance={openInst}
          onClose={() => setOpenInst(null)}
          onComplete={(instanceId, completedBy, x, y) => {
            setOpenInst(null)
            handleDrop(instanceId, completedBy, x, y)
          }}
        />
      )}
    </>
  )
}
