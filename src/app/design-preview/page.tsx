'use client'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const variants = ['primary', 'secondary', 'ghost', 'danger'] as const
const sizes = ['sm', 'md', 'lg'] as const

export default function DesignPreviewPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 py-4">
      <header className="space-y-2">
        <p className="font-[family-name:var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Operis · Design System · Étape 1
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">
          Aperçu des fondations
        </h1>
        <p className="max-w-xl text-sm text-[var(--text-secondary)]">
          Navy #021246, accent bleu → cyan, cards arrondies, boutons glow. Page temporaire de validation visuelle.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Boutons — variantes</h2>
        <Card padding="lg" className="space-y-6">
          {variants.map(variant => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <span className="w-20 font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--text-muted)]">
                {variant}
              </span>
              <Button variant={variant} size="md">
                {variant === 'primary' ? 'Action principale' : `Bouton ${variant}`}
              </Button>
              <Button variant={variant} size="md" disabled>
                Désactivé
              </Button>
              <Button variant={variant} size="md" loading>
                Chargement
              </Button>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Boutons — tailles (primary)</h2>
        <Card padding="lg">
          <div className="flex flex-wrap items-end gap-4">
            {sizes.map(size => (
              <Button key={size} variant="primary" size={size}>
                Taille {size}
              </Button>
            ))}
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Cards</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card padding="md">
            <h3 className="mb-1 text-base font-semibold text-[var(--text-primary)]">Surface standard</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Fond légèrement plus clair que le navy principal, bordure subtile et ombre douce.
            </p>
          </Card>
          <Card padding="md" hover>
            <h3 className="mb-1 text-base font-semibold text-[var(--text-primary)]">Surface interactive</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Survolez cette card — bordure et ombre renforcées (hover).
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Palette & typographie</h2>
        <Card padding="lg" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Navy', bg: 'var(--bg)' },
              { label: 'Surface', bg: 'var(--surface)' },
              { label: 'Raised', bg: 'var(--surface-raised)' },
              { label: 'Bleu', bg: 'var(--color-accent-blue)' },
              { label: 'Cyan', bg: 'var(--color-accent-cyan)' },
              { label: 'Gradient', bg: 'var(--accent-gradient)' },
            ].map(sw => (
              <div key={sw.label} className="text-center">
                <div
                  className="mb-1 h-12 w-12 rounded-[var(--radius-md)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
                  style={{ background: sw.bg }}
                />
                <span className="font-[family-name:var(--font-mono)] text-[9px] text-[var(--text-muted)]">{sw.label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-[var(--border)] pt-4">
            <p className="text-lg font-bold text-[var(--text-primary)]">Titre — DM Sans 700</p>
            <p className="text-sm text-[var(--text-secondary)]">Corps secondaire — lisibilité sur fond navy.</p>
            <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-muted)]">Label mono — DM Mono</p>
          </div>
        </Card>
      </section>
    </div>
  )
}
