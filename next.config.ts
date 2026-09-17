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
  experimental: {
    // Par défaut Next.js (proxy, ex-middleware) tronque silencieusement à 10 Mo tout corps
    // de requête passant par middleware.ts — qui intercepte /api/*. Un DCE/plan BTP de
    // 15-20 Mo est un usage normal, pas un abus (trouvé lors du crash test : upload d'un
    // document de 15 Mo -> JSON.parse() plantait sur le corps tronqué, 500 vide).
    // Relevé à 40 Mo (encodage base64 ~33% plus gros que le fichier ~30 Mo max accepté côté
    // route, voir MAX_UPLOAD_BYTES dans tenders/[id]/documents/route.ts), largement sous le
    // plafond Vercel de 100 Mo par requête.
    proxyClientMaxBodySize: '40mb',
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
