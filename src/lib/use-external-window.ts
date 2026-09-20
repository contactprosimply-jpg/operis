'use client'

import { useEffect, useRef, useState } from 'react'

/** Téléphones, tablettes et petits écrans : une fenêtre navigateur séparée n'y a pas de sens
 *  (iOS Safari ouvre un onglet, Android/PWA installée la bloquent ou sortent de l'app). */
function prefersInlineWindow(): boolean {
  return window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches
}

/**
 * Rend la fenêtre en plein écran dans la page courante (portail vers <body>) : c'est le mode
 * mobile, et le secours quand le navigateur bloque la popup. Suit le clavier virtuel via
 * visualViewport (sur iOS un élément fixed ne rétrécit pas quand le clavier s'ouvre, et les
 * boutons du bas passeraient dessous).
 */
function openInlineWindow(onMount: (el: HTMLElement) => void): () => void {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-inline-window', '')
  Object.assign(overlay.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    top: '0',
    height: '100dvh',
    zIndex: '10001',
    background: 'var(--bg-primary)',
    overscrollBehavior: 'contain',
  })

  const inner = document.createElement('div')
  Object.assign(inner.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: 'env(safe-area-inset-top, 0px)',
    bottom: 'env(safe-area-inset-bottom, 0px)',
  })
  overlay.appendChild(inner)
  document.body.appendChild(overlay)
  document.body.classList.add('modal-open')

  const vv = window.visualViewport
  const fit = () => {
    if (!vv) return
    overlay.style.top = `${vv.offsetTop}px`
    overlay.style.height = `${vv.height}px`
  }
  fit()
  vv?.addEventListener('resize', fit)
  vv?.addEventListener('scroll', fit)

  onMount(inner)

  return () => {
    vv?.removeEventListener('resize', fit)
    vv?.removeEventListener('scroll', fit)
    document.body.classList.remove('modal-open')
    overlay.remove()
  }
}

/**
 * Ouvre une vraie fenêtre de navigateur séparée (window.open) et retourne le noeud DOM
 * dans lequel monter un portail React — comme la fenêtre de composition de Thunderbird,
 * pas une popup superposée à la page. Copie les feuilles de style (Next.js) de la page
 * courante pour que la nouvelle fenêtre ait le même rendu visuel.
 *
 * Sur mobile / écran tactile, ou si la popup est bloquée, la « fenêtre » est un calque plein
 * écran dans la page (voir openInlineWindow).
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

    if (prefersInlineWindow()) {
      const close = openInlineWindow(setMount)
      return () => {
        close()
        setMount(null)
      }
    }

    const width = widthRef.current
    const height = heightRef.current
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2)
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2)

    const win = window.open(
      '',
      `operis-compose-${Date.now()}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes`,
    )
    if (!win) {
      // Popup bloquée par le navigateur : on bascule sur le calque plein écran dans la page.
      const close = openInlineWindow(setMount)
      return () => {
        close()
        setMount(null)
      }
    }

    win.document.title = titleRef.current
    win.document.head.innerHTML = ''
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
      win.document.head.appendChild(node.cloneNode(true))
    })

    // Le thème (clair/sombre/marine) et l'accent sont appliqués en variables CSS inline sur
    // <html> par applyTheme() — les copier ici, sinon la fenêtre repart sur les valeurs par
    // défaut du CSS statique au lieu du thème choisi par l'utilisateur.
    const themeStyle = document.documentElement.getAttribute('style')
    if (themeStyle) win.document.documentElement.setAttribute('style', themeStyle)

    win.document.body.style.margin = '0'
    win.document.body.style.height = '100vh'
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
