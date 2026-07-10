'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Ouvre une vraie fenêtre de navigateur séparée (window.open) et retourne le noeud DOM
 * dans lequel monter un portail React — comme la fenêtre de composition de Thunderbird,
 * pas une popup superposée à la page. Copie les feuilles de style (Next.js) de la page
 * courante pour que la nouvelle fenêtre ait le même rendu visuel.
 */
export function useExternalWindowPortal(
  isOpen: boolean,
  options: { title: string; width: number; height: number; onClosedByUser: () => void },
): HTMLElement | null {
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const onClosedRef = useRef(options.onClosedByUser)
  const widthRef = useRef(options.width)
  const heightRef = useRef(options.height)
  const titleRef = useRef(options.title)

  useEffect(() => {
    onClosedRef.current = options.onClosedByUser
    widthRef.current = options.width
    heightRef.current = options.height
    titleRef.current = options.title
  })

  useEffect(() => {
    if (!isOpen) return
    if (typeof window === 'undefined') return

    const width = widthRef.current
    const height = heightRef.current
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2)
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2)

    const win = window.open(
      '',
      `operis-compose-${Date.now()}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes`,
    )
    if (!win) return // popup bloqué par le navigateur — le formulaire reste inline en secours

    win.document.title = titleRef.current
    win.document.head.innerHTML = ''
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
      win.document.head.appendChild(node.cloneNode(true))
    })

    win.document.body.style.margin = '0'
    win.document.body.style.height = '100vh'
    win.document.body.style.background = '#021246'
    win.document.body.style.overflow = 'hidden'

    const el = win.document.createElement('div')
    el.style.height = '100%'
    win.document.body.appendChild(el)
    setMount(el)

    const handleUnload = () => onClosedRef.current()
    win.addEventListener('pagehide', handleUnload)

    const closedCheck = window.setInterval(() => {
      if (win.closed) {
        window.clearInterval(closedCheck)
        onClosedRef.current()
      }
    }, 400)

    return () => {
      window.clearInterval(closedCheck)
      win.removeEventListener('pagehide', handleUnload)
      if (!win.closed) win.close()
      setMount(null)
    }
  }, [isOpen])

  return mount
}
