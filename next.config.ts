import type { NextConfig } from 'next'

// Identifiant unique par build — sert à détecter côté client qu'un nouveau déploiement
// est en ligne (voir /api/build-info + DesktopUpdateBanner) pour proposer un rechargement,
// que ce soit dans un onglet web ou dans le shell desktop qui ne se recharge jamais tout seul.
const buildId = `build-${Date.now()}`

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'mammoth'],
  typescript: {
    ignoreBuildErrors: false,
  },
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
