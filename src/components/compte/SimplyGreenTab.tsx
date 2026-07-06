'use client'

import {
  SIMPLY_GREEN_GLOBAL,
  SIMPLY_GREEN_PROGRAM,
  SIMPLY_GREEN_PROJECTS,
  estimateCo2Tonnes,
  userTreesFinanced,
} from '@/lib/simply-green'

type Props = {
  hasActiveSubscription: boolean
  companyName?: string | null
}

function StatCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div style={{
      flex: '1 1 160px', padding: '18px 16px', borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(2,18,70,0.04) 100%)',
      border: '1px solid rgba(34,197,94,0.2)',
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#021246', fontFamily: 'DM Mono, monospace' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{label}</div>
    </div>
  )
}

export default function SimplyGreenTab({ hasActiveSubscription, companyName }: Props) {
  const myTrees = userTreesFinanced(hasActiveSubscription)
  const myCo2 = estimateCo2Tonnes(myTrees)

  return (
    <div>
      {/* En-tête programme */}
      <section style={{
        background: 'linear-gradient(135deg, #021246 0%, #0a3d2e 100%)',
        borderRadius: 14, padding: '24px 26px', marginBottom: 20, color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7, marginBottom: 6 }}>
              Programme Operis × Simply
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
              🌿 {SIMPLY_GREEN_PROGRAM.name}
            </h2>
            <p style={{ fontSize: 14, opacity: 0.9, margin: 0, maxWidth: 480, lineHeight: 1.55 }}>
              {SIMPLY_GREEN_PROGRAM.tagline}
            </p>
          </div>
          <div style={{
            padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {SIMPLY_GREEN_PROGRAM.rule}
          </div>
        </div>
      </section>

      {/* Compteurs communauté */}
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: '#021246', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace', margin: '0 0 12px' }}>
          Impact collectif Operis
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <StatCard icon="🌳" value={SIMPLY_GREEN_GLOBAL.treesFinanced.toLocaleString('fr-FR')} label="Arbres financés" />
          <StatCard icon="🌍" value={`${SIMPLY_GREEN_GLOBAL.co2Tonnes} t`} label="CO₂ estimé compensé" />
          <StatCard icon="👷" value={SIMPLY_GREEN_GLOBAL.participatingCompanies.toLocaleString('fr-FR')} label="Entreprises participantes" />
        </div>
      </section>

      {/* Contribution personnelle */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '20px 22px', marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: '#021246', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace', margin: '0 0 16px' }}>
          Votre contribution
        </h3>
        {hasActiveSubscription ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Grâce à votre abonnement Operis{companyName ? ` (${companyName})` : ''}, vous participez au programme Simply Green.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>Arbres financés</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{myTrees}</div>
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>CO₂ estimé compensé</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{myCo2} t</div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Souscrivez à un abonnement Operis pour planter un arbre et rejoindre le programme Simply Green.
          </p>
        )}
      </section>

      {/* Projets */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '20px 22px', marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: '#021246', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace', margin: '0 0 6px' }}>
          Localisation des projets
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Arbres plantés via Reforest&apos;Action dans le cadre du programme Simply Green.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SIMPLY_GREEN_PROJECTS.map(project => (
            <div key={project.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 10,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{project.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {project.region} · {project.country}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', fontFamily: 'DM Mono, monospace' }}>
                  {project.treesPlanted.toLocaleString('fr-FR')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>arbres</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Partenaire */}
      <section style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '20px 22px',
      }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: '#021246', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace', margin: '0 0 12px' }}>
          Partenaire officiel
        </h3>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, background: '#16a34a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0,
          }}>🌳</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#021246', marginBottom: 6 }}>
              {SIMPLY_GREEN_PROGRAM.partner}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.55 }}>
              {SIMPLY_GREEN_PROGRAM.partnerDescription}
            </p>
            <a
              href={SIMPLY_GREEN_PROGRAM.partnerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 13, fontWeight: 600, color: '#16a34a', textDecoration: 'none',
              }}
            >
              Découvrir Reforest&apos;Action →
            </a>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '16px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
          Les chiffres CO₂ sont des estimations basées sur les données Reforest&apos;Action. L&apos;impact réel varie selon les essences, les sols et la durée de vie des arbres.
        </p>
      </section>
    </div>
  )
}
