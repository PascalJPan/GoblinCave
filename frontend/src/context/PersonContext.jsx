import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

const PersonContext = createContext({ person1: 'Person 1', person2: 'Person 2' })

export const usePersons = () => useContext(PersonContext)

export function PersonProvider({ children }) {
  const [persons, setPersons] = useState({ person1: 'Person 1', person2: 'Person 2' })

  useEffect(() => {
    api.config()
      .then(cfg => setPersons({ person1: cfg.person1_name || 'Person 1', person2: cfg.person2_name || 'Person 2' }))
      .catch(() => {})
  }, [])

  return <PersonContext.Provider value={persons}>{children}</PersonContext.Provider>
}
