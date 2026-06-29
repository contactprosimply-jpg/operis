/** URL de production par défaut (fallback si variable d'environnement absente). */
export const DEFAULT_SITE_URL = 'https://operis-f26g7.vercel.app'

/**
 * URL publique du site (sans slash final).
 * Variable canonique : NEXT_PUBLIC_SITE_URL
 * Rétrocompat : NEXT_PUBLIC_APP_URL
 */
export function siteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'
  return DEFAULT_SITE_URL
}

export function sitePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteUrl()}${normalized}`
}
