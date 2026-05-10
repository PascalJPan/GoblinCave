import { useState } from 'react'

export default function Character({ name, onDrop }) {
  const [over, setOver] = useState(false)
  const [eating, setEating] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOver(true)
  }

  function handleDragLeave() {
    setOver(false)
  }

  async function handleDrop(e) {
    e.preventDefault()
    setOver(false)
    const instanceId = parseInt(e.dataTransfer.getData('instanceId'), 10)
    if (!instanceId) return
    setEating(true)
    try {
      await onDrop(instanceId, name, e.clientX, e.clientY)
    } finally {
      setTimeout(() => setEating(false), 450)
    }
  }

  return (
    <div
      className={`character-zone ${over ? 'drag-over' : ''} ${eating ? 'eating' : ''}`}
      data-dropzone={name}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {eating ? `NOM NOM` : name.toUpperCase()}
    </div>
  )
}
