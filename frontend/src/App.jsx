import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { PersonProvider } from './context/PersonContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ChoreList from './components/ChoreList'
import ChoreForm from './components/ChoreForm'
import ChoreEdit from './components/ChoreEdit'
import History from './components/History'
import Statistics from './components/Statistics'
import Stars from './components/Stars'
import './index.css'

function Nav() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  if (location.pathname === '/') {
    return (
      <>
        <button className="sun-btn" aria-label="Open navigation" onClick={() => setOpen(o => !o)} />
        {open && (
          <>
            <div className="sun-overlay" onClick={() => setOpen(false)} />
            <div className="sun-nav">
              <NavLink to="/chores" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpen(false)}>CHORES</NavLink>
              <NavLink to="/history" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpen(false)}>HISTORY</NavLink>
              <NavLink to="/stats" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpen(false)}>STATS</NavLink>
              <NavLink to="/stars" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpen(false)}>STARS</NavLink>
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <nav>
      <span className="nav-logo">GoblinCave</span>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Cave</NavLink>
        <NavLink to="/chores" className={({ isActive }) => isActive ? 'active' : ''}>Chores</NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? 'active' : ''}>History</NavLink>
        <NavLink to="/stats" className={({ isActive }) => isActive ? 'active' : ''}>Stats</NavLink>
        <NavLink to="/stars" className={({ isActive }) => isActive ? 'active' : ''}>Stars</NavLink>
      </div>
    </nav>
  )
}

export default function App() {
  const { loggedIn, loading, login } = useAuth()

  if (loading) return null
  if (!loggedIn) return <Login onLogin={login} />

  return (
    <PersonProvider>
    <BrowserRouter basename="/personal/GoblinCave">
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chores" element={<ChoreList />} />
        <Route path="/chores/new" element={<ChoreForm />} />
        <Route path="/chores/:id/edit" element={<ChoreEdit />} />
        <Route path="/history" element={<History />} />
        <Route path="/stats" element={<Statistics />} />
        <Route path="/stars" element={<Stars />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
    </PersonProvider>
  )
}
