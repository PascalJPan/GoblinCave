import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { fmtDuration, daysSince, daysUntil } from '../utils/time'
import { usePersons } from '../context/PersonContext'
import { playComplete } from '../utils/sounds'

function LogPopover({ chore, mode, onClose, onLogged, persons }) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [who, setWho] = useState('person1')
  const [when, setWhen] = useState(todayIso)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    try {
      const fn = mode === 'early' ? api.logEarly : api.logExtra
      await fn(chore.id, { completed_by: who, completed_at: when || null })
      playComplete()
      onLogged()
      onClose()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover-panel" onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
          {mode === 'early' ? 'EARLY — counts as the next scheduled one' : 'EXTRA — does not affect the schedule'}
        </div>
        <div style={{ fontWeight: 'bold', marginBottom: 12, fontSize: 14 }}>
          {chore.emoji} {chore.name}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { key: 'person1',  label: persons.person1,  color: 'var(--person1)' },
            { key: 'person2',  label: persons.person2,  color: 'var(--person2)' },
            { key: 'together', label: 'together',       color: 'var(--together)' },
          ].map(p => (
            <button
              key={p.key} type="button"
              className={`tab-btn ${who === p.key ? 'selected' : ''}`}
              style={who === p.key ? { color: p.color, borderColor: p.color } : {}}
              onClick={() => setWho(p.key)}
            >{p.label.toUpperCase()}</button>
          ))}
        </div>
        <div className="field" style={{ margin: '0 0 12px 0' }}>
          <label style={{ fontSize: 11 }}>done on</label>
          <input type="date" value={when} max={todayIso} onChange={e => setWhen(e.target.value)} />
        </div>
        {err && <div className="error-msg" style={{ marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn small" disabled={busy} onClick={submit}>
            {busy ? '...' : 'LOG'}
          </button>
          <button type="button" className="btn secondary small" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  )
}

export default function ChoreList() {
  const [categories, setCategories] = useState([])
  const [chores, setChores] = useState([])
  const [loading, setLoading] = useState(true)
  const [logTarget, setLogTarget] = useState(null) // { chore, mode }
  const navigate = useNavigate()
  const persons = usePersons()

  const dragCat = useRef(null)
  const dragChore = useRef(null)

  function refreshChores() {
    api.listChores().then(setChores)
  }

  useEffect(() => {
    Promise.all([api.listCategories(), api.listChores()])
      .then(([cats, ch]) => { setCategories(cats); setChores(ch) })
      .finally(() => setLoading(false))
  }, [])

  function onCatDragStart(e, catId) {
    dragCat.current = catId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('type', 'category')
  }

  async function onCatDrop(e, targetId) {
    e.preventDefault()
    if (e.dataTransfer.getData('type') !== 'category') return
    if (dragCat.current === targetId) return
    const ids = categories.map(c => c.id)
    const from = ids.indexOf(dragCat.current)
    const to = ids.indexOf(targetId)
    const reordered = [...ids]
    reordered.splice(from, 1)
    reordered.splice(to, 0, dragCat.current)
    setCategories(cats => {
      const map = Object.fromEntries(cats.map(c => [c.id, c]))
      return reordered.map(id => map[id])
    })
    await api.reorderCategories(reordered)
  }

  function onChoreDragStart(e, choreId) {
    dragChore.current = choreId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('type', 'chore')
  }

  async function onChoreDrop(e, targetId, category) {
    e.preventDefault()
    if (e.dataTransfer.getData('type') !== 'chore') return
    if (dragChore.current === targetId) return
    const catChores = chores.filter(c => c.category === category).map(c => c.id)
    const from = catChores.indexOf(dragChore.current)
    const to = catChores.indexOf(targetId)
    if (from === -1) return
    const reordered = [...catChores]
    reordered.splice(from, 1)
    reordered.splice(to, 0, dragChore.current)
    setChores(ch => {
      const others = ch.filter(c => c.category !== category)
      const map = Object.fromEntries(ch.map(c => [c.id, c]))
      return [...others, ...reordered.map(id => map[id])]
    })
    await api.reorderChores(category, reordered)
  }

  if (loading) return <div className="page" style={{ color: 'var(--text-dim)', fontSize: 9 }}>loading...</div>

  const choresByCategory = {}
  chores.forEach(c => {
    if (!choresByCategory[c.category]) choresByCategory[c.category] = []
    choresByCategory[c.category].push(c)
  })

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div className="page-title" style={{ margin: 0 }}>CHORES</div>
        <Link to="/chores/new">
          <button className="btn small">+ NEW</button>
        </Link>
      </div>

      {logTarget && (
        <LogPopover
          chore={logTarget.chore}
          mode={logTarget.mode}
          persons={persons}
          onClose={() => setLogTarget(null)}
          onLogged={refreshChores}
        />
      )}

      {categories.map(cat => {
        const catChores = choresByCategory[cat.name] || []
        return (
          <div key={cat.id} className="category-section">
            <div
              className="category-header"
              draggable
              onDragStart={e => onCatDragStart(e, cat.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => onCatDrop(e, cat.id)}
            >
              <span className="drag-handle">⠿</span>
              <span className="category-name">{cat.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{catChores.length}</span>
            </div>

            {catChores.map(chore => {
              const lastDays = fmtDuration(daysSince(chore.last_completed_at))
              const nextDaysRaw = chore.next_due_date ? daysUntil(chore.next_due_date) : null
              const nextDays = nextDaysRaw != null ? fmtDuration(Math.abs(nextDaysRaw)) : null
              const nextPrefix = nextDaysRaw != null && nextDaysRaw < 0 ? '-' : ''

              const lastColor = chore.last_completed_by === 'person1' ? 'var(--person1)'
                : chore.last_completed_by === 'person2' ? 'var(--person2)'
                : chore.last_completed_by === 'together' ? 'var(--together)'
                : 'var(--text-dim)'

              const nextColor = chore.next_assignee === 'person1' ? 'var(--person1)'
                : chore.next_assignee === 'person2' ? 'var(--person2)'
                : chore.next_assignee === 'together' ? 'var(--together)'
                : chore.next_assignee === 'alternating' ? 'var(--alternating)'
                : 'var(--text-dim)'

              return (
                <div
                  key={chore.id}
                  className="chore-item"
                  draggable
                  onDragStart={e => onChoreDragStart(e, chore.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => onChoreDrop(e, chore.id, cat.name)}
                >
                  <span className="drag-handle" style={{ fontSize: 10, color: 'var(--text-dim)' }}>⠿</span>
                  <div className="chore-item-emoji">{chore.emoji}</div>
                  <div className="chore-item-info">
                    <div className="chore-item-name-row">
                      <span className="chore-item-name">{chore.name}</span>
                      <span className="chore-item-divider"> | </span>
                      <span style={{ color: lastColor }}>{lastDays ? `${lastDays} ago` : '—'}</span>
                      <span className="chore-item-divider"> | </span>
                      <span style={{ color: nextColor }}>{nextDays ? `${nextPrefix}${nextDays}` : '—'}</span>
                    </div>
                  </div>
                  <div className="chore-item-actions">
                    <button className="btn small" title="Done early (counts as the next scheduled one)"
                      onClick={() => setLogTarget({ chore, mode: 'early' })}>EARLY</button>
                    <button className="btn secondary small" title="Extra log (does not affect the schedule)"
                      onClick={() => setLogTarget({ chore, mode: 'extra' })}>EXTRA</button>
                    <button className="btn secondary small" onClick={() => navigate(`/chores/${chore.id}/edit`)}>EDIT</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
