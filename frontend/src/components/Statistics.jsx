import { useState, useEffect } from 'react'
import { api } from '../api'
import { usePersons } from '../context/PersonContext'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function personColor(who) {
  if (who === 'person1') return 'var(--person1)'
  if (who === 'person2') return 'var(--person2)'
  return 'var(--together)'
}

function Dot({ who, title }) {
  return (
    <span title={title} style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: personColor(who), margin: '0 2px', flexShrink: 0,
    }} />
  )
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(n) {
  const d = startOfToday()
  d.setDate(d.getDate() - n)
  return d
}

function isoDate(d) { return d.toISOString().slice(0, 10) }

function filterForView(completions, view) {
  const end = startOfToday()
  const start = view === 'week'  ? daysAgo(6)
              : view === 'month' ? daysAgo(29)
              : new Date(end.getFullYear(), end.getMonth() - 11, 1)
  return completions.filter(c => {
    const d = new Date(c.due_date + 'T00:00:00')
    return d >= start && d <= end
  })
}

function StatTiles({ completions, persons }) {
  const byPerson = {}
  completions.forEach(c => { byPerson[c.completed_by] = (byPerson[c.completed_by] || 0) + 1 })
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
      {[
        { label: 'total',            value: completions.length,         color: null },
        { label: persons.person1,    value: byPerson.person1  || 0,     color: personColor('person1') },
        { label: persons.person2,    value: byPerson.person2  || 0,     color: personColor('person2') },
        ...(byPerson.together ? [{ label: 'together', value: byPerson.together, color: personColor('together') }] : []),
      ].map(t => (
        <div key={t.label} className="stat-box">
          <div className="stat-label" style={t.color ? { color: t.color } : {}}>{t.label}</div>
          <div className="stat-value" style={t.color ? { color: t.color } : {}}>{t.value}</div>
        </div>
      ))}
    </div>
  )
}

function WeekChart({ completions }) {
  const byDate = {}
  completions.forEach(c => { if (!byDate[c.due_date]) byDate[c.due_date] = []; byDate[c.due_date].push(c) })
  const now = startOfToday()
  const days = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 16 }}>
      {days.map((d, i) => {
        const iso = isoDate(d)
        const isToday = d.getTime() === now.getTime()
        return (
          <div key={i} style={{
            background: 'var(--bg)', borderRadius: 4, padding: '6px 4px',
            border: `1px solid ${isToday ? 'var(--accent)' : 'var(--panel)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 52,
          }}>
            <div style={{ fontSize: 11, color: isToday ? 'var(--accent)' : 'var(--text-dim)' }}>
              {WEEKDAY_SHORT[d.getDay()]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.getDate()}</div>
            {(byDate[iso] || []).map((c, j) => <Dot key={j} who={c.completed_by} title={`${c.due_date} — ${c.completed_by}`} />)}
          </div>
        )
      })}
    </div>
  )
}

function MonthChart({ completions }) {
  const byDate = {}
  completions.forEach(c => { if (!byDate[c.due_date]) byDate[c.due_date] = []; byDate[c.due_date].push(c) })
  const now = startOfToday()
  const days = Array.from({ length: 30 }, (_, i) => daysAgo(29 - i))
  const cells = [...Array(days[0].getDay()).fill(null), ...days]

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {WEEKDAY_SHORT.map(d => (
          <div key={d} style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => !d ? <div key={i} /> : (
          <div key={i} style={{
            background: 'var(--bg)', borderRadius: 3, padding: '4px 2px',
            border: `1px solid ${d.getTime() === now.getTime() ? 'var(--accent)' : 'var(--panel)'}`,
            minHeight: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}>
            <div style={{ fontSize: 11, color: d.getTime() === now.getTime() ? 'var(--accent)' : 'var(--text-dim)' }}>
              {d.getDate()}
            </div>
            {(byDate[isoDate(d)] || []).map((c, j) => <Dot key={j} who={c.completed_by} title={`${c.due_date} — ${c.completed_by}`} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

function YearChart({ completions }) {
  const now = startOfToday()
  const byMonth = {}
  completions.forEach(c => {
    const d = new Date(c.due_date + 'T00:00:00')
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(c)
  })
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, marginTop: 16 }}>
      {months.map(({ year, month }) => {
        const key = `${year}-${month}`
        const items = byMonth[key] || []
        const isCurrent = year === now.getFullYear() && month === now.getMonth()
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ fontSize: 10, color: isCurrent ? 'var(--accent)' : 'var(--text-dim)', marginBottom: 2 }}>
              {MONTH_NAMES[month]}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, minHeight: 12 }}>
              {items.map((c, j) => <Dot key={j} who={c.completed_by} title={`${c.due_date} — ${c.completed_by}`} />)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{items.length || ''}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Statistics() {
  const persons = usePersons()
  const [chores, setChores] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [stats, setStats] = useState(null)
  const [chartView, setChartView] = useState('week')
  const [loading, setLoading] = useState(false)
  const [includeExtras, setIncludeExtras] = useState(true)

  useEffect(() => {
    api.listChores().then(ch => {
      setChores(ch)
      if (ch.length) setSelectedId(String(ch[0].id))
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.choreStats(selectedId).then(setStats).finally(() => setLoading(false))
  }, [selectedId])

  const completions = stats
    ? (includeExtras ? stats.completions : stats.completions.filter(c => c.kind !== 'extra'))
    : []
  const filtered = filterForView(completions, chartView)
  const hasExtras = stats && stats.completions.some(c => c.kind === 'extra')

  return (
    <div className="page">
      <div className="page-title">STATS</div>

      <div className="field" style={{ marginBottom: 24 }}>
        <label>chore</label>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          {chores.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>loading...</div>}

      {stats && !loading && (
        <>
          <div className="tab-group">
            {['week', 'month', 'year'].map(v => (
              <button key={v} type="button"
                className={`tab-btn ${chartView === v ? 'selected' : ''}`}
                onClick={() => setChartView(v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          <StatTiles completions={filtered} persons={persons} />

          {chartView === 'week'  && <WeekChart  completions={filtered} />}
          {chartView === 'month' && <MonthChart completions={filtered} />}
          {chartView === 'year'  && <YearChart  completions={filtered} />}

          {hasExtras && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 11, color: 'var(--text-dim)' }}>
              <input type="checkbox" checked={includeExtras} onChange={e => setIncludeExtras(e.target.checked)} />
              include extras
            </label>
          )}
        </>
      )}
    </div>
  )
}
