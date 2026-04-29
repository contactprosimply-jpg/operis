'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  resolvedTheme: 'dark' | 'light'
}>({ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark' })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('operis_theme') as Theme ?? 'dark'
    setThemeState(saved)
  }, [])

  useEffect(() => {
    const resolve = () => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      return theme
    }
    const resolved = resolve()
    setResolvedTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)

    // Apply theme CSS vars
    const root = document.documentElement
    if (resolved === 'dark') {
      root.style.setProperty('--bg-primary', '#0f1117')
      root.style.setProperty('--bg-secondary', '#1a1d27')
      root.style.setProperty('--bg-card', '#1e2130')
      root.style.setProperty('--bg-hover', '#252839')
      root.style.setProperty('--border', 'rgba(255,255,255,0.07)')
      root.style.setProperty('--border-hi', 'rgba(255,255,255,0.12)')
      root.style.setProperty('--text-primary', '#f1f3f9')
      root.style.setProperty('--text-secondary', '#8b92a5')
      root.style.setProperty('--text-muted', '#4a5168')
    } else {
      root.style.setProperty('--bg-primary', '#f8f9fc')
      root.style.setProperty('--bg-secondary', '#ffffff')
      root.style.setProperty('--bg-card', '#ffffff')
      root.style.setProperty('--bg-hover', '#f1f3f9')
      root.style.setProperty('--border', 'rgba(0,0,0,0.08)')
      root.style.setProperty('--border-hi', 'rgba(0,0,0,0.14)')
      root.style.setProperty('--text-primary', '#0f1117')
      root.style.setProperty('--text-secondary', '#4a5168')
      root.style.setProperty('--text-muted', '#8b92a5')
    }
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('operis_theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
