import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Operis — Gestion AO BTP',
    short_name: 'Operis',
    description: 'Gestion des appels d\'offres pour les professionnels du BTP.',
    lang: 'fr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay'],
    background_color: '#f8fafc',
    theme_color: '#f8fafc',
    orientation: 'any',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/pwa-icons/any-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/any-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    // Raccourcis (appui long sur l'icône Android) vers les écrans les plus utilisés en déplacement.
    shortcuts: [
      { name: "Appels d'offres", short_name: 'AO', url: '/tenders' },
      { name: 'Messagerie', short_name: 'Mail', url: '/mail' },
      { name: 'Fournisseurs', short_name: 'Fournisseurs', url: '/suppliers' },
    ],
  }
}
