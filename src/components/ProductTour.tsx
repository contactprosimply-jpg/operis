'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  PRODUCT_TOUR_STEPS,
  markProductTourDone,
  shouldAutoStartTour,
  type ProductTourStep,
} from '@/lib/product-tour'

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 10

function measureTarget(target?: string): SpotlightRect | null {
  if (!target) return null
  const el = document.querySelector(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  }
}

function tooltipStyle(
  rect: SpotlightRect | null,
  placement: ProductTourStep['placement'],
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10001,
    width: 'min(360px, calc(100vw - 32px))',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-hi)',
    borderRadius: 14,
    padding: '20px 22px',
    boxShadow: 'var(--shadow-md)',
    fontFamily: 'DM Sans, system-ui',
    animation: 'scaleIn 0.22s ease',
  }

  if (!rect || placement === 'center') {
    return {
      ...base,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const gap = 16
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (placement === 'bottom') {
    const top = Math.min(rect.top + rect.height + gap, vh - 220)
    const left = Math.min(Math.max(16, rect.left), vw - 376)
    return { ...base, top, left }
  }
  if (placement === 'top') {
    const top = Math.max(16, rect.top - gap - 200)
    const left = Math.min(Math.max(16, rect.left), vw - 376)
    return { ...base, top, left }
  }
  if (placement === 'right') {
    const left = Math.min(rect.left + rect.width + gap, vw - 376)
    const top = Math.min(Math.max(16, rect.top), vh - 220)
    return { ...base, top, left }
  }
  // left
  const left = Math.max(16, rect.left - gap - 360)
  const top = Math.min(Math.max(16, rect.top), vh - 220)
  return { ...base, top, left }
}

export default function ProductTour() {
  const router = useRouter()
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  const step = PRODUCT_TOUR_STEPS[stepIndex]
  const isLast = stepIndex >= PRODUCT_TOUR_STEPS.length - 1

  const updateRect = useCallback(() => {
    setRect(measureTarget(step?.target))
  }, [step?.target])

  const finish = useCallback(() => {
    markProductTourDone()
    setActive(false)
  }, [])

  const goToStep = useCallback((index: number) => {
    const next = PRODUCT_TOUR_STEPS[index]
    if (!next) return
    setStepIndex(index)
    if (pathname !== next.route) {
      router.push(next.route)
    }
  }, [pathname, router])

  useEffect(() => {
    if (shouldAutoStartTour()) setActive(true)
    const onStart = () => {
      setStepIndex(0)
      setActive(true)
    }
    window.addEventListener('operis-start-tour', onStart)
    return () => window.removeEventListener('operis-start-tour', onStart)
  }, [])

  useEffect(() => {
    if (!active || !step) return
    if (pathname !== step.route) {
      router.push(step.route)
      return
    }
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t1 = setTimeout(updateRect, 100)
    const t2 = setTimeout(updateRect, 450)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [active, step, pathname, updateRect, router])

  if (!active || !step) return null

  const showSpotlight = step.target && rect && step.placement !== 'center'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'auto' }}>
      {/* Overlay sombre */}
      {!showSpotlight && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,13,24,0.78)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* Spotlight cercle / zone mise en évidence */}
      {showSpotlight && rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(8,13,24,0.78), 0 0 0 2px rgba(79,142,247,0.6), 0 0 24px rgba(79,142,247,0.35)',
            pointerEvents: 'none',
            transition: 'all 0.25s ease',
          }}
        />
      )}

      {/* Carte explicative */}
      <div style={tooltipStyle(showSpotlight ? rect : null, step.placement)}>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', marginBottom: 8, letterSpacing: '0.08em' }}>
          GUIDE OPERIS · {stepIndex + 1}/{PRODUCT_TOUR_STEPS.length}
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
          {step.title}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {step.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={finish}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui', padding: 0,
            }}
          >
            Passer
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => goToStep(stepIndex - 1)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-hi)',
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'DM Sans, system-ui', fontWeight: 600,
                }}
              >
                Précédent
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) finish()
                else goToStep(stepIndex + 1)
              }}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: 'var(--gradient-primary)', color: '#fff', fontSize: 12,
                cursor: 'pointer', fontFamily: 'DM Sans, system-ui', fontWeight: 600,
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              {isLast ? 'Terminer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
