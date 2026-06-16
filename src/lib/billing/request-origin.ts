import type { NextRequest } from 'next/server'

/** Origine absolue depuis la requête (jamais NEXT_PUBLIC_APP_URL). */
export function requestOrigin(req: NextRequest): string {
  const origin = req.headers.get('origin')
  if (origin?.trim()) return origin.trim().replace(/\/$/, '')

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!host) throw new Error('Impossible de déterminer l\'origine (host manquant)')

  const proto = (req.headers.get('x-forwarded-proto') ?? 'https').split(',')[0].trim()
  return `${proto}://${host}`.replace(/\/$/, '')
}

export function billingReturnUrlsFromOrigin(origin: string) {
  const base = origin.replace(/\/$/, '')
  return {
    success: `${base}/billing/activating`,
    cancel: `${base}/settings/billing?canceled=1`,
  }
}
