import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Operis — Gestion AO BTP',
  description: "Plateforme SaaS de gestion des appels d'offres BTP",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
          <Sidebar />
          <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0, background: 'var(--bg-primary)' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
