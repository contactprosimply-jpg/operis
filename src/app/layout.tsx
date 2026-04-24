// ============================================================
// OPERIS — app/layout.tsx
// Layout principal — sidebar + contenu
// ============================================================

import type { Metadata } from 'next'
import { IBM_Plex_Mono, Syne } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '600', '700'],
})

const ibmMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Operis — Gestion AO BTP',
  description: 'Application SaaS BTP — Appels d\'offres',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${syne.variable} ${ibmMono.variable}`}>
      <body className="bg-[#021246] text-white antialiased overflow-hidden">
        <div className="flex h-screen w-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6 min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
