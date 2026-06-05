import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { usePersons } from '../context/PersonContext'

const EMOJI_LIST = ['🧹', '🍽️', '🛁', '🌿', '🗑️', '🛒', '👕', '🧽', '🪴', '🛏️', '🧺', '🪥']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1))
const ASSIGNEES = [null, 'person1', 'person2', 'alternating', 'together']

function nextAssignee(current) {
  const idx = ASSIGNEES.indexOf(current)
  return ASSIGNEES[(idx + 1) % ASSIGNEES.length]
}

function DayDot({ assignee }) {
  if (!assignee) return <div className="day-dot" style={{ background: 'transparent', border: '1px solid #555', borderRadius: '50%' }} />
  return <div className={`day-dot ${assignee}`} />
}

// ── Weekly Builder ────────────────────────────────────────────────────────────
function WeeklyBuilder({ rows, setRows }) {
  const cycleLen = rows.length

  function toggleDay(rowIdx, day) {
    setRows(rs => rs.map((row, i) => {
      if (i !== rowIdx) return row
      return { ...row, [day]: nextAssignee(row[day]) }
    }))
  }

  function addRow() {
    setRows(rs => [...rs, Object.fromEntries(WEEKDAYS.map(d => [d, null]))])
  }

  function removeRow() {
    if (rows.length <= 1) return
    setRows(rs => rs.slice(0, -1))
  }

  return (
    <div className="weekly-builder">
      <div className="cycle-label">
        {cycleLen === 1 ? 'repeats every week' : `repeats every ${cycleLen} weeks`}
      </div>
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="week-row-wrap">
          <div className="week-row-label">
            {cycleLen > 1 ? `wk ${rowIdx + 1}` : ''}
          </div>
          <div className="week-row">
            {WEEKDAYS.map(day => {
              const assignee = row[day]
              return (
                <button key={day} type="button" className="day-btn" onClick={() => toggleDay(rowIdx, day)}>
                  <span>{day}</span>
                  <DayDot assignee={assignee} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="row-controls">
        <button type="button" className="btn secondary small" onClick={addRow}>+ week</button>
        {rows.length > 1 && (
          <button type="button" className="btn danger small" onClick={removeRow}>− week</button>
        )}
      </div>
    </div>
  )
}

// ── Generic day/month grid builder ───────────────────────────────────────────
function GridBuilder({ items, slots, setSlots, gridClass, btnClass }) {
  function toggle(key) {
    setSlots(s => ({ ...s, [key]: nextAssignee(s[key] || null) }))
  }

  return (
    <div className={gridClass}>
      {items.map(key => {
        const assignee = slots[key] || null
        return (
          <button key={key} type="button" className={btnClass} onClick={() => toggle(key)}>
            <span>{key}</span>
            <DayDot assignee={assignee} />
          </button>
        )
      })}
    </div>
  )
}

function PrefWeekday({ value, onChange }) {
  return (
    <div className="field">
      <label>preferred weekday</label>
      <div className="pref-weekday">
        <button type="button" className={`pref-wd-btn ${!value ? 'selected' : ''}`} onClick={() => onChange(null)}>none</button>
        {WEEKDAYS.map(d => (
          <button key={d} type="button"
            className={`pref-wd-btn ${value === d ? 'selected' : ''}`}
            onClick={() => onChange(d)}>
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Build slots from form state ───────────────────────────────────────────────
function buildSlots(scheduleType, rows, daySlots) {
  if (scheduleType === 'weekly') {
    const result = []
    rows.forEach((row, rowIdx) => {
      WEEKDAYS.forEach(day => {
        const assignee = row[day]
        if (!assignee) return
        result.push({ row_index: rowIdx, day_spec: day, assignee, alt_start: 'person1' })
      })
    })
    return result
  }
  return Object.entries(daySlots)
    .filter(([, a]) => a)
    .map(([key, assignee]) => ({ row_index: 0, day_spec: key, assignee, alt_start: 'person1' }))
}

// ── Restore form state from chore ─────────────────────────────────────────────
function initFromChore(chore) {
  if (!chore) return null
  const { schedule_type, slots = [] } = chore

  if (schedule_type === 'weekly') {
    const maxRow = slots.reduce((m, s) => Math.max(m, s.row_index), 0)
    const rows = Array.from({ length: maxRow + 1 }, () =>
      Object.fromEntries(WEEKDAYS.map(d => [d, null]))
    )
    slots.forEach(s => { rows[s.row_index][s.day_spec] = s.assignee })
    return { rows, daySlots: {} }
  }

  const daySlots = {}
  slots.forEach(s => { daySlots[s.day_spec] = s.assignee })
  return { rows: [Object.fromEntries(WEEKDAYS.map(d => [d, null]))], daySlots }
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function ChoreForm({ initial }) {
  const navigate = useNavigate()
  const persons = usePersons()
  const [categories, setCategories] = useState([])
  const [emoji, setEmoji] = useState(initial?.emoji || '🧹')
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [category, setCategory] = useState(initial?.category || '')
  const [scheduleType, setScheduleType] = useState(initial?.schedule_type || 'weekly')
  const [prefWeekday, setPrefWeekday] = useState(initial?.preferred_weekday || null)

  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const restored = initFromChore(initial)
  const emptyWeekRow = () => Object.fromEntries(WEEKDAYS.map(d => [d, null]))

  const [rows, setRows] = useState(restored?.rows || [emptyWeekRow()])
  const [daySlots, setDaySlots] = useState(restored?.daySlots || {})

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const todayIso = new Date().toISOString().slice(0, 10)
  const [initialDoneOn, setInitialDoneOn] = useState(false)
  const [initialDoneBy, setInitialDoneBy] = useState('person1')
  const [initialDoneAt, setInitialDoneAt] = useState(todayIso)
  const [skipNext, setSkipNext] = useState(false)
  const [previewText, setPreviewText] = useState('')

  useEffect(() => {
    api.listCategories().then(cats => {
      setCategories(cats)
      if (!initial && cats.length && !category) setCategory(cats[0].name)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live preview: ask backend what the next-due would be after this initial completion.
  useEffect(() => {
    if (!initialDoneOn) { setPreviewText(''); return }
    const slots = buildSlots(scheduleType, rows, daySlots)
    if (!slots.length) { setPreviewText(''); return }
    let cancelled = false
    api.previewNext({
      schedule_type: scheduleType,
      preferred_weekday: scheduleType !== 'weekly' ? prefWeekday : null,
      slots,
      initial_done: { completed_by: initialDoneBy, completed_at: initialDoneAt || null },
      skip_next: skipNext,
    }).then(res => {
      if (cancelled) return
      const due = new Date(res.next_due_date + 'T00:00:00')
      const today = new Date(); today.setHours(0,0,0,0)
      const diffDays = Math.round((due - today) / 86400000)
      const weeks = Math.floor(diffDays / 7)
      const days = diffDays % 7
      const inWhen = weeks > 0
        ? (days > 0 ? `${weeks}w ${days}d` : `${weeks}w`)
        : `${diffDays}d`
      const dateStr = due.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
      const who = res.next_assignee === 'person1' ? persons.person1
                : res.next_assignee === 'person2' ? persons.person2
                : 'together'
      setPreviewText(`next: ${dateStr} (in ${inWhen}) — by ${who}`)
    }).catch(() => setPreviewText('—'))
    return () => { cancelled = true }
  }, [initialDoneOn, initialDoneBy, initialDoneAt, skipNext, scheduleType, rows, daySlots, prefWeekday, persons])

  function handleScheduleType(t) {
    setScheduleType(t)
    setRows([emptyWeekRow()])
    setDaySlots({})
    setPrefWeekday(null)
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    try {
      const created = await api.createCategory(newCatName.trim())
      setCategories(cats => [...cats, created].sort((a, b) => a.name.localeCompare(b.name)))
      setCategory(created.name)
      setAddingCat(false)
      setNewCatName('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name required'); return }
    const slots = buildSlots(scheduleType, rows, daySlots)
    if (!slots.length) { setError('Select at least one day/slot'); return }
    setError('')
    setLoading(true)
    const payload = {
      name: name.trim(), description, emoji, category,
      schedule_type: scheduleType,
      preferred_weekday: scheduleType !== 'weekly' ? prefWeekday : null,
      slots,
    }
    if (!initial && initialDoneOn) {
      payload.initial_done = { completed_by: initialDoneBy, completed_at: initialDoneAt || null }
      payload.skip_next = skipNext
    }
    try {
      if (initial) {
        await api.updateChore(initial.id, payload)
      } else {
        await api.createChore(payload)
      }
      navigate('/chores')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title">{initial ? 'EDIT CHORE' : 'NEW CHORE'}</div>
      <form onSubmit={handleSubmit}>

        <div className="form-section">
          <div className="form-section-title">basics</div>

          <div className="field">
            <label>emoji</label>
            <div className="emoji-grid">
              {EMOJI_LIST.map(e => (
                <button key={e} type="button"
                  className={`emoji-btn ${emoji === e ? 'selected' : ''}`}
                  onClick={() => setEmoji(e)}>
                  {e}
                </button>
              ))}
              <input
                type="text"
                value={EMOJI_LIST.includes(emoji) ? '' : emoji}
                onChange={e => e.target.value && setEmoji(e.target.value)}
                placeholder="other"
                style={{ width: 60, padding: '8px', fontSize: 14, textAlign: 'center' }}
              />
            </div>
          </div>

          <div className="field">
            <label>name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dishes" />
          </div>

          <div className="field">
            <label>description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={8}
              placeholder="What exactly needs doing... use - for checklist items"
              style={{ resize: 'vertical', minHeight: 140 }}
            />
          </div>

          <div className="field">
            <label>category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            {!addingCat ? (
              <button type="button" className="btn secondary small" style={{ marginTop: 6, width: 'auto' }}
                onClick={() => setAddingCat(true)}>
                + NEW CATEGORY
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="category name"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn small" onClick={handleAddCategory}>ADD</button>
                <button type="button" className="btn secondary small" onClick={() => { setAddingCat(false); setNewCatName('') }}>✕</button>
              </div>
            )}
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">schedule</div>
          <div className="tab-group">
            {['weekly', 'monthly', 'yearly'].map(t => (
              <button key={t} type="button"
                className={`tab-btn ${scheduleType === t ? 'selected' : ''}`}
                onClick={() => handleScheduleType(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {scheduleType === 'weekly' && (
            <WeeklyBuilder rows={rows} setRows={setRows} />
          )}

          {scheduleType === 'monthly' && (
            <>
              <GridBuilder
                items={MONTH_DAYS}
                slots={daySlots} setSlots={setDaySlots}
                gridClass="day-grid"
                btnClass="day-grid-btn"
              />
              <PrefWeekday value={prefWeekday} onChange={setPrefWeekday} />
            </>
          )}

          {scheduleType === 'yearly' && (
            <>
              <GridBuilder
                items={MONTHS}
                slots={daySlots} setSlots={setDaySlots}
                gridClass="month-grid"
                btnClass="month-btn"
              />
              <PrefWeekday value={prefWeekday} onChange={setPrefWeekday} />
            </>
          )}

          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 2 }}>
            click a day to cycle:
            <span style={{ color: 'var(--person1)' }}> {persons.person1.toLowerCase()}</span> →
            <span style={{ color: 'var(--person2)' }}> {persons.person2.toLowerCase()}</span> →
            <span style={{ color: 'var(--alternating)' }}> alternating</span> →
            <span style={{ color: 'var(--together)' }}> together</span> → off
          </div>
        </div>

        {!initial && (
          <div className="form-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={initialDoneOn} onChange={e => setInitialDoneOn(e.target.checked)} />
              first time already done?
            </label>
            {initialDoneOn && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { key: 'person1',  label: persons.person1,  color: 'var(--person1)' },
                    { key: 'person2',  label: persons.person2,  color: 'var(--person2)' },
                    { key: 'together', label: 'together',       color: 'var(--together)' },
                  ].map(p => (
                    <button
                      key={p.key} type="button"
                      className={`tab-btn ${initialDoneBy === p.key ? 'selected' : ''}`}
                      style={initialDoneBy === p.key ? { color: p.color, borderColor: p.color } : {}}
                      onClick={() => setInitialDoneBy(p.key)}
                    >
                      {p.label.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>done on</label>
                  <input type="date" value={initialDoneAt} max={todayIso}
                         onChange={e => setInitialDoneAt(e.target.value)} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={skipNext} onChange={e => setSkipNext(e.target.checked)} />
                  skip next time too
                </label>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', minHeight: 16 }}>
                  {previewText || 'calculating...'}
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? '...' : (initial ? 'SAVE' : 'CREATE')}
          </button>
          <button type="button" className="btn secondary" onClick={() => navigate('/chores')}>
            CANCEL
          </button>
        </div>

        {initial && (
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--panel)' }}>
            {!confirmDelete ? (
              <button type="button" className="btn danger small" onClick={() => setConfirmDelete(true)}>
                DELETE CHORE
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  delete "{initial.name}"? history stays.
                </span>
                <button
                  type="button"
                  className="btn danger small"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true)
                    try {
                      await api.deleteChore(initial.id)
                      navigate('/chores')
                    } catch (err) {
                      setError(err.message)
                      setDeleting(false)
                      setConfirmDelete(false)
                    }
                  }}
                >YES</button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setConfirmDelete(false)}
                >CANCEL</button>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
