export function fmtDuration(days) {
  if (days == null || isNaN(days)) return null
  const abs = Math.floor(Math.abs(days))
  const y = Math.floor(abs / 365)
  const rem = abs % 365
  const w = Math.floor(rem / 7)
  const d = rem % 7
  const parts = [y && `${y}y`, w && `${w}w`, d && `${d}d`].filter(Boolean)
  return parts.length ? parts.join('') : '0d'
}

export function daysSince(isoDatetime) {
  if (!isoDatetime) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return (today.getTime() - new Date(isoDatetime).getTime()) / 86400000
}

export function daysUntil(isoDate) {
  if (!isoDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(isoDate + 'T00:00:00')
  return (due.getTime() - today.getTime()) / 86400000
}
