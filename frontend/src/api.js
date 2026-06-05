const BASE = '/personal/GoblinCave/api'

async function req(method, path, body) {
  const opts = { method, credentials: 'include', headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw Object.assign(new Error(err.detail || 'Request failed'), { status: res.status })
  }
  return res.json()
}

export const api = {
  login: (password) => req('POST', '/auth/login', { password }),
  logout: () => req('POST', '/auth/logout'),
  me: () => req('GET', '/auth/me'),

  dashboard: () => req('GET', '/dashboard'),

  listCategories: () => req('GET', '/categories'),
  createCategory: (name) => req('POST', '/categories', { name }),
  reorderCategories: (ids) => req('PATCH', '/categories/reorder', { ids }),

  listChores: () => req('GET', '/chores'),
  getChore: (id) => req('GET', `/chores/${id}`),
  createChore: (data) => req('POST', '/chores', data),
  updateChore: (id, data) => req('PUT', `/chores/${id}`, data),
  deleteChore: (id) => req('DELETE', `/chores/${id}`),
  reorderChores: (category, ids) => req('PATCH', '/chores/reorder', { category, ids }),

  previewNext: (data) => req('POST', '/chores/preview-next', data),
  logExtra: (id, data) => req('POST', `/chores/${id}/log-extra`, data),
  logEarly: (id, data) => req('POST', `/chores/${id}/log-early`, data),

  complete: (instanceId, completed_by) =>
    req('POST', `/instances/${instanceId}/complete`, { completed_by }),
  uncomplete: (instanceId) => req('DELETE', `/instances/${instanceId}/complete`),

  history: (limit = 50, offset = 0) =>
    req('GET', `/history?limit=${limit}&offset=${offset}`),

  choreStats: (id) => req('GET', `/chores/${id}/stats`),

  config: () => req('GET', '/config'),
  updateConfig: (data) => req('PATCH', '/config', data),
}
