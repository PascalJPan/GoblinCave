import { useState, useEffect } from 'react'
import { api } from '../api'
import { usePersons } from '../context/PersonContext'

function fmtHistory(dueDate, completedAt) {
  if (!dueDate || !completedAt) return ''
  const due = new Date(dueDate + 'T00:00:00')
  const done = new Date(completedAt)
  const dueStr = due.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = done.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })
  // Compare calendar dates (local), not raw timestamp difference, so 'same day'
  // doesn't depend on time-of-day.
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const doneDay = new Date(done.getFullYear(), done.getMonth(), done.getDate())
  const diffDays = Math.round((doneDay - dueDay) / 86400000)
  const rel = diffDays === 0 ? 'same day'
    : diffDays === 1 ? '1 day later'
    : diffDays > 1 ? `${diffDays} days later`
    : diffDays === -1 ? '1 day early'
    : `${-diffDays} days early`
  return `due ${dueStr}, ${rel} ${timeStr}`
}

function PersonTag({ who, persons }) {
  if (!who) return null
  const color = who === 'person1' ? 'var(--person1)'
    : who === 'person2' ? 'var(--person2)'
    : 'var(--together)'
  const label = who === 'person1' ? persons.person1
    : who === 'person2' ? persons.person2
    : 'together'
  return <span className={who} style={{ color }}>{label.toUpperCase()}</span>
}

export default function History() {
  const persons = usePersons()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const [reverting, setReverting] = useState(false)
  const LIMIT = 50

  useEffect(() => {
    setLoading(true)
    api.history(LIMIT, offset)
      .then(d => { setItems(d.items); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [offset])

  async function handleRevert(id) {
    setReverting(true)
    try {
      await api.uncomplete(id)
      const d = await api.history(LIMIT, offset)
      setItems(d.items)
      setTotal(d.total)
    } catch (e) {
      console.error('Revert failed', e)
    } finally {
      setReverting(false)
      setConfirmId(null)
    }
  }

  if (loading) return <div className="page" style={{ color: 'var(--text-dim)', fontSize: 9 }}>loading...</div>

  return (
    <div className="page">
      <div className="page-title">HISTORY</div>
      {items.map(item => (
        <div key={item.id} className="history-item">
          <div className="history-emoji">{item.emoji}</div>
          <div className="history-info">
            <div className="history-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{item.name}</span>
              {item.kind === 'early' && <span className="badge early">EARLY</span>}
              {item.kind === 'extra' && <span className="badge extra">EXTRA</span>}
            </div>
            <div className="history-meta">{fmtHistory(item.due_date, item.completed_at)}</div>
          </div>
          <div className="history-who">
            <div><span style={{ color: 'var(--text-dim)' }}>for </span><PersonTag who={item.assigned_to} persons={persons} /></div>
            <div><span style={{ color: 'var(--text-dim)' }}>by </span><PersonTag who={item.completed_by} persons={persons} /></div>
          </div>
          <div className="history-revert">
            {confirmId === item.id ? (
              <div className="history-confirm">
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>undo?</span>
                <button
                  className="history-confirm-btn yes"
                  disabled={reverting}
                  onClick={() => handleRevert(item.id)}
                >✓</button>
                <button
                  className="history-confirm-btn no"
                  onClick={() => setConfirmId(null)}
                >✕</button>
              </div>
            ) : (
              <button
                className="history-revert-btn"
                title="Undo this completion"
                onClick={() => setConfirmId(item.id)}
              >↺</button>
            )}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        {offset > 0 && <button className="btn secondary small" onClick={() => setOffset(o => o - LIMIT)}>← PREV</button>}
        {offset + LIMIT < total && <button className="btn secondary small" onClick={() => setOffset(o => o + LIMIT)}>NEXT →</button>}
      </div>
    </div>
  )
}
