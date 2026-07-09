import WebsiteNav from '@/components/website/WebsiteNav'
import { APP_NAME } from '@/lib/brand'

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(2,18,70,0.06), transparent)',
    }}>
      <WebsiteNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
        {children}
      </main>
      <footer style={{
        borderTop: '1px solid var(--border)', padding: '24px',
        textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
      }}>
        © {new Date().getFullYear()} {APP_NAME}
        {' · '}
        <a href="/legal" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Mentions légales</a>
      </footer>
    </div>
  )
}
