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
    // {CHECKOUT_SESSION_ID} est un template Stripe remplacé côté Stripe avant la redirection —
    // ne pas encoder les accolades. Permet à /billing/activating de vérifier le paiement
    // directement (indépendamment du délai du webhook).
    success: `${base}/billing/activating?session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}/settings/billing?canceled=1`,
  }
}
