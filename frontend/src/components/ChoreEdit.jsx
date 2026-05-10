import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import ChoreForm from './ChoreForm'

export default function ChoreEdit() {
  const { id } = useParams()
  const [chore, setChore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getChore(id).then(setChore).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="page" style={{ color: 'var(--text-dim)', fontSize: 9 }}>loading...</div>
  if (!chore) return <div className="page" style={{ color: 'var(--accent)', fontSize: 9 }}>not found</div>

  return <ChoreForm initial={chore} />
}
