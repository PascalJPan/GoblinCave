import { useState, useMemo, useRef, useEffect } from 'react'
import { playClick } from '../utils/sounds'

function cloudClass(daysOverdue) {
  if (daysOverdue >= 5) return 'overdue-rain'
  return `overdue-${Math.min(daysOverdue, 4)}`
}

export default function CloudCard({ instance, onDragStart, onDragEnd, onOpen, onTouchDrop }) {
  const [dragging, setDragging] = useState(false)
  const cardRef = useRef(null)
  const touchRef = useRef(null)
  // Keep latest callbacks reachable inside native listeners without re-registering them
  const cbs = useRef({})
  cbs.current = { onDragStart, onDragEnd, onTouchDrop }

  const { cardStyle, variant } = useMemo(() => ({
    cardStyle: {
      width: `${65 + Math.random() * 20}%`,
      '--wobble-dur': `${5 + Math.random() * 4}s`,
      '--wobble-delay': `${-(Math.random() * 5).toFixed(2)}s`,
    },
    variant: `cloud-v${Math.floor(Math.random() * 4) + 1}`,
  }), [])

  // Desktop HTML5 drag
  function handleDragStart(e) {
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('instanceId', String(instance.id))
    onDragStart?.(instance.id)
  }

  function handleDragEnd() {
    setDragging(false)
    onDragEnd?.()
  }

  function handleClick() {
    if (dragging) return
    playClick()
    onOpen?.(instance)
  }

  // Touch drag (iOS Safari doesn't support HTML5 DnD)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    function createGhost() {
      const rect = el.getBoundingClientRect()
      const ghost = el.cloneNode(true)
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0.85',
        transform: 'scale(1.05)',
        transition: 'none',
        margin: '0',
      })
      document.body.appendChild(ghost)
      return ghost
    }

    function cleanup() {
      if (!touchRef.current) return
      touchRef.current.ghost?.remove()
      touchRef.current = null
    }

    function onTouchStart(e) {
      const touch = e.touches[0]
      const rect = el.getBoundingClientRect()
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top,
        moved: false,
        ghost: null,
      }
    }

    function onTouchMove(e) {
      if (!touchRef.current) return
      const touch = e.touches[0]
      const dx = touch.clientX - touchRef.current.startX
      const dy = touch.clientY - touchRef.current.startY

      if (!touchRef.current.moved) {
        if (Math.sqrt(dx * dx + dy * dy) < 8) return
        touchRef.current.moved = true
        touchRef.current.ghost = createGhost()
        setDragging(true)
        cbs.current.onDragStart?.(instance.id)
      }

      e.preventDefault()

      const { ghost, offsetX, offsetY } = touchRef.current
      if (ghost) {
        ghost.style.left = `${touch.clientX - offsetX}px`
        ghost.style.top  = `${touch.clientY - offsetY}px`
      }
    }

    function onTouchEnd(e) {
      if (!touchRef.current) return
      if (!touchRef.current.moved) { cleanup(); return }

      e.preventDefault()  // suppress the subsequent click event

      const touch = e.changedTouches[0]
      // elementFromPoint ignores the ghost because it has pointerEvents:none
      const target = document.elementFromPoint(touch.clientX, touch.clientY)
      const dropZone = target?.closest('[data-dropzone]')

      cleanup()
      setDragging(false)
      cbs.current.onDragEnd?.()

      if (dropZone) {
        cbs.current.onTouchDrop?.(instance.id, dropZone.dataset.dropzone)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', cleanup)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', cleanup)
      cleanup()
    }
  }, [instance.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cls = cloudClass(instance.days_overdue)

  return (
    <div
      ref={cardRef}
      className={`cloud-card ${cls} ${variant} ${dragging ? 'dragging' : ''}`}
      style={cardStyle}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    >
      <div className="cloud-top">
        <span className="cloud-emoji">{instance.chore_emoji}</span>
        <span className="cloud-name">{instance.chore_name}</span>
      </div>
    </div>
  )
}
