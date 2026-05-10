import { useState } from 'react'
import { fmtDuration, daysSince } from '../utils/time'
import { usePersons } from '../context/PersonContext'

function parseDescription(text) {
  if (!text) return []
  return text.split('\n')
    .map((line, i) => {
      const bullet = line.match(/^[-*•]\s+(.+)/)
      return bullet
        ? { type: 'check', text: bullet[1], key: i }
        : { type: 'text', text: line.trim(), key: i }
    })
    .filter(p => p.text)
}

function PersonTag({ who, persons }) {
  if (!who) return null
  const color = who === 'person1' ? 'var(--person1)'
    : who === 'person2' ? 'var(--person2)'
    : 'var(--together)'
  const label = who === 'person1' ? persons.person1
    : who === 'person2' ? persons.person2
    : 'together'
  return <span style={{ color, fontWeight: 'bold' }}>{label.toUpperCase()}</span>
}

export default function CloudModal({ instance, onClose, onComplete }) {
  const persons = usePersons()
  const [checked, setChecked] = useState(new Set())

  function toggle(key) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function handleComplete(person, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    onComplete?.(instance.id, person, x, y)
  }

  const parts = parseDescription(instance.chore_description)
  const lastDays = instance.last_completed_at ? fmtDuration(daysSince(instance.last_completed_at)) : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-emoji">{instance.chore_emoji}</span>
            <span className="modal-name">{instance.chore_name}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {(instance.last_completed_by || instance.last_completed_at) && (
          <div className="modal-last">
            <span style={{ color: 'var(--text-dim)' }}>last: </span>
            <PersonTag who={instance.last_completed_by} persons={persons} />
            {lastDays && <span style={{ color: 'var(--text-dim)' }}> · {lastDays} ago</span>}
          </div>
        )}

        {parts.length > 0 && (
          <div className="modal-desc">
            {parts.map(p =>
              p.type === 'check' ? (
                <div
                  key={p.key}
                  className={`modal-check-item ${checked.has(p.key) ? 'checked' : ''}`}
                  onClick={() => toggle(p.key)}
                >
                  <span className="modal-checkbox">{checked.has(p.key) ? '☑' : '☐'}</span>
                  <span className="modal-check-text">{p.text}</span>
                </div>
              ) : (
                <p key={p.key} className="modal-text-line">{p.text}</p>
              )
            )}
          </div>
        )}

        <div className="modal-complete-row">
          <button
            className="modal-complete-btn person1"
            onClick={e => handleComplete('person1', e)}
          >{persons.person1[0].toUpperCase()}</button>
          <button
            className="modal-complete-btn together"
            onClick={e => handleComplete('together', e)}
          >♡</button>
          <button
            className="modal-complete-btn person2"
            onClick={e => handleComplete('person2', e)}
          >{persons.person2[0].toUpperCase()}</button>
        </div>
      </div>
    </div>
  )
}
