'use client'

import { useEffect } from 'react'
import { applyTheme, loadStoredTheme } from '@/lib/theme'

export default function ThemeBootstrap() {
  useEffect(() => {
    const { themeId, accent } = loadStoredTheme()
    applyTheme(themeId, accent)
  }, [])
  return null
}
