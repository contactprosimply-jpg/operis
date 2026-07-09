'use client'

import WebsiteNav from '@/components/website/WebsiteNav'
import { OperisLogoMark } from '@/components/OperisLogoMark'

const FEATURES = [
  {
    title: 'Appels d\'offres centralisés',
    desc: 'Créez, suivez et pilotez vos consultations BTP depuis un tableau de bord unique. Statuts, échéances et documents au même endroit.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    title: 'Messagerie synchronisée',
    desc: 'Connectez vos boîtes mail professionnelles. Les AO entrants sont détectés automatiquement et rattachés à vos dossiers.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    title: 'Devis fournisseurs',
    desc: 'Consultez vos fournisseurs, relancez les absents et comparez les offres. L\'IA vous aide à analyser et valider les devis.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
]

const DEMO_TENDERS = [
  { title: 'Rénovation école primaire — Lot plomberie', client: 'Ville de Lyon', deadline: '12j', budget: '185 000 €', status: 'En cours', statusColor: '#3b7ef6', priorite: 'Haute' },
  { title: 'Extension entrepôt logistique', client: 'ProLogis SA', deadline: '5j', budget: '420 000 €', status: 'Urgence', statusColor: '#ef4444', priorite: 'Urgente' },
  { title: 'Menuiseries extérieures — Résidence Les Pins', client: 'Nexity', deadline: '21j', budget: '92 500 €', status: 'Nouveau', statusColor: '#94a3b8', priorite: 'Normale' },
  { title: 'VRD parking commercial', client: 'Carrefour Property', deadline: '8j', budget: '156 000 €', status: 'En cours', statusColor: '#3b7ef6', priorite: 'Normale' },
]

const PLANS = [
  {
    name: 'Pro',
    price: '79,99',
    desc: 'Pour les petites équipes BTP',
    features: [
      '2 utilisateurs max',
      '20 Go de stockage documents',
      'AO & messagerie synchronisée',
      'Consultations fournisseurs',
    ],
    cta: "S'abonner",
    highlight: false,
  },
  {
    name: 'Business',
    price: '129,99',
    desc: 'Pour les équipes qui veulent aller plus vite',
    features: [
      '5 utilisateurs max',
      '50 Go de stockage documents',
      'Analyse IA des devis',
      'Rapports avancés',
      'Support prioritaire',
    ],
    cta: "S'abonner",
    highlight: true,
  },
]

function Logo({ size = 40 }: { size?: number }) {
  return <OperisLogoMark size={size} glow />
}

function BtnPrimary({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: 'var(--gradient-primary)', color: '#fff', border: 'none', borderRadius: 9,
      padding: '12px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
      boxShadow: 'var(--shadow-glow)', fontFamily: 'DM Sans, system-ui',
    }}>
      {children}
    </a>
  )
}

function BtnGhost({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-hi)',
      borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 500, textDecoration: 'none',
      fontFamily: 'DM Sans, system-ui',
    }}>
      {children}
    </a>
  )
}

export default function LandingPage() {
  return (
    <div className="animate-fade-in" style={{
      height: '100vh', overflowY: 'auto', background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37,99,235,0.12), transparent), radial-gradient(ellipse 40% 30% at 100% 0%, rgba(99,102,241,0.08), transparent)',
    }}>
      <WebsiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--accent-soft)', border: '1px solid rgba(37,99,235,0.2)',
          borderRadius: 100, padding: '6px 14px', marginBottom: 24,
          fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.04em',
        }}>
          PLATEFORME BTP · GESTION AO
        </div>
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.12,
          color: 'var(--text-primary)', margin: '0 0 20px', letterSpacing: '-0.02em',
        }}>
          Gérez vos appels d&apos;offres<br />
          <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            sans rien laisser passer
          </span>
        </h1>
        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--text-secondary)', lineHeight: 1.65,
          maxWidth: 580, margin: '0 auto 36px',
        }}>
          Operis centralise vos consultations, synchronise votre messagerie et suit vos devis fournisseurs.
          Conçu pour les entreprises du BTP qui veulent gagner du temps sur chaque dossier.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <BtnPrimary href="/signup">Créer un compte gratuit</BtnPrimary>
          <BtnGhost href="/pricing">Voir les tarifs</BtnGhost>
          <BtnGhost href="/login">Se connecter</BtnGhost>
          <BtnPrimary href="/signup">Créer un compte</BtnPrimary>
          <BtnGhost href="/telechargement">Télécharger l&apos;app</BtnGhost>
          <BtnGhost href="#appels-offres">Voir les appels d&apos;offres</BtnGhost>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          Abonnement mensuel · Annulation à tout moment
        </p>

        {/* Mock dashboard preview */}
        <div style={{
          marginTop: 56, background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, boxShadow: 'var(--shadow-md)', overflow: 'hidden', textAlign: 'left',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {['#ef4444', '#f59e0b', '#22c55e'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
            <span style={{ marginLeft: 8, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)' }}>operis — dashboard</span>
          </div>
          <div style={{ padding: '20px 24px 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'AO actifs', val: '12', color: 'var(--accent)' },
              { label: 'Réponses reçues', val: '87%', color: 'var(--success)' },
              { label: 'Échéances < 7j', val: '3', color: 'var(--warn)' },
              { label: 'Mails non traités', val: '5', color: 'var(--accent-2)' },
            ].map(k => (
              <div key={k.label} style={{
                background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Aperçu appels d'offres */}
      <section id="appels-offres" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 56px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            Vos appels d&apos;offres, en un coup d&apos;œil
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, maxWidth: 520, marginInline: 'auto' }}>
            Statuts, échéances, budgets et fournisseurs — connectez-vous pour piloter vos dossiers réels.
          </p>
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, boxShadow: 'var(--shadow-md)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Appels d&apos;offres</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Exemple de tableau — données de démonstration</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <BtnGhost href="/telechargement">Télécharger Operis</BtnGhost>
              <BtnPrimary href="/signup">Créer un compte</BtnPrimary>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  {['AO', 'Client', 'Échéance', 'Budget', 'Priorité', 'Statut'].map(h => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: 'left', fontSize: 10,
                      fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_TENDERS.map((t, i) => (
                  <tr key={t.title} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'rgba(148,163,184,0.03)' : 'transparent' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: 280 }}>{t.title}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{t.client}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: t.deadline === '5j' ? '#f87171' : '#34d399' }}>{t.deadline}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#34d399' }}>{t.budget}</td>
                    <td style={{ padding: '14px 16px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>{t.priorite}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600,
                        padding: '3px 8px', borderRadius: 4,
                        background: `${t.statusColor}18`, color: t.statusColor,
                        border: `1px solid ${t.statusColor}40`,
                      }}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{
            padding: '16px 20px', borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)', textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Créez votre compte pour gérer vos consultations, relances et devis fournisseurs.
            </span>
            <a href="/signup" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', marginLeft: 8 }}>
              Commencer gratuitement →
            </a>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
              Le chaos des AO vous coûte des marchés
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
              Emails éparpillés, deadlines oubliées, devis comparés à la main dans Excel…
              Les entreprises BTP perdent du temps et ratent des opportunités chaque semaine.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
              Operis remplace les tableurs et les dossiers mail par un flux unique, traçable et actionnable.
            </p>
          </div>
          <div style={{
            background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 14, padding: '24px 28px',
          }}>
            {[
              'AO perdus dans la boîte mail',
              'Relances fournisseurs oubliées',
              'Comparatif devis manuel et lent',
              'Aucune visibilité sur les échéances',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 14, color: 'var(--text-secondary)' }}>
                <span style={{ color: '#f87171' }}>✕</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fonctionnalites" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              Tout ce dont vous avez besoin
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, maxWidth: 480, marginInline: 'auto' }}>
              Une suite complète pour piloter vos marchés, de la consultation à la validation du devis.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 14,
                padding: '28px 24px', boxShadow: 'var(--shadow-sm)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: 'var(--accent-soft)',
                  color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Simply integration */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32,
          alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, padding: '36px 32px', boxShadow: 'var(--shadow-md)',
        }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Intégration Simply
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              De l&apos;AO gagné au chantier en un clic
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
              Quand vous remportez un marché, transférez-le directement dans Simply pour piloter
              le chantier, les équipes et la facturation sans ressaisie.
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 80, height: 80, borderRadius: 20, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, boxShadow: '0 0 24px rgba(16,185,129,0.3)',
            }}>S</div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border-hi)',
              borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 500,
              fontFamily: 'DM Sans, system-ui',
            }}>
              Bientôt disponible
            </span>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="tarifs" style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            Abonnements simples et transparents
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>
            Choisissez la formule adaptée à votre activité.{' '}
            <a href="/pricing" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              Voir les offres Pro et Business →
            </a>
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'stretch' }}>
          {PLANS.map(plan => (
            <div key={plan.name} style={{
              background: 'var(--bg-card)', border: plan.highlight ? '2px solid var(--accent)' : '1px solid var(--border-hi)',
              borderRadius: 16, padding: '28px 24px', boxShadow: plan.highlight ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
              display: 'flex', flexDirection: 'column', position: 'relative',
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--gradient-primary)', color: '#fff', fontSize: 10, fontWeight: 600,
                  fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', padding: '4px 12px', borderRadius: 100,
                }}>
                  POPULAIRE
                </div>
              )}
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{plan.name}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>{plan.desc}</p>
              <div style={{ marginBottom: 24 }}>
                {plan.price === 'Sur mesure' ? (
                  <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>Sur mesure</span>
                ) : (
                  <>
                    <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)' }}>{plan.price}€</span>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}> /mois</span>
                  </>
                )}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', flex: 1 }}>
                {plan.features.map(feat => (
                  <li key={feat} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    {feat}
                  </li>
                ))}
              </ul>
              <a href="/pricing" style={{
                display: 'block', textAlign: 'center', textDecoration: 'none',
                background: plan.highlight ? 'var(--gradient-primary)' : 'var(--bg-secondary)',
                color: plan.highlight ? '#fff' : 'var(--text-primary)',
                border: plan.highlight ? 'none' : '1px solid var(--border-hi)',
                borderRadius: 9, padding: '12px', fontSize: 14, fontWeight: 600,
                boxShadow: plan.highlight ? 'var(--shadow-glow)' : 'none',
              }}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              Ils pilotent leurs AO avec Operis
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {[
              { name: 'Marc D.', role: 'Dirigeant TCE — Lyon', quote: 'On a divisé par deux le temps passé sur les consultations. Les relances auto nous ont sauvé plusieurs marchés.' },
              { name: 'Sophie L.', role: 'Responsable AO — Paris', quote: 'La messagerie synchronisée détecte les AO entrants avant qu\'on les rate. Indispensable au quotidien.' },
              { name: 'Karim B.', role: 'Gérant BTP — Marseille', quote: 'Le comparatif de devis en un coup d\'œil, c\'est exactement ce qu\'on attendait. Simple et efficace.' },
            ].map(t => (
              <div key={t.name} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 14,
                padding: '24px 22px', boxShadow: 'var(--shadow-sm)',
              }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px', fontStyle: 'italic' }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 4 }}>{t.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        background: 'var(--gradient-primary)', margin: '0 24px 48px', borderRadius: 16,
        padding: '48px 32px', textAlign: 'center', maxWidth: 1052, marginInline: 'auto',
      }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>
          Prêt à structurer vos appels d&apos;offres ?
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', margin: '0 0 28px', maxWidth: 440, marginInline: 'auto' }}>
          Rejoignez les entreprises BTP qui centralisent leurs consultations avec Operis.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/signup" style={{
            display: 'inline-flex', background: '#fff', color: 'var(--accent)',
            borderRadius: 9, padding: '13px 28px', fontSize: 14, fontWeight: 700,
            textDecoration: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}>
            Créer mon compte
          </a>
          <a href="/pricing" style={{
            display: 'inline-flex', background: 'transparent', color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)', borderRadius: 9, padding: '13px 28px',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>
            Voir les tarifs
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '28px 24px 40px' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={28} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Operis</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            © {new Date().getFullYear()} Operis · Gestion des appels d&apos;offres BTP
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a href="/legal#cgu" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>CGU</a>
            <a href="/legal#cgv" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>CGV</a>
            <a href="/legal#confidentialite" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>Confidentialité</a>
            <a href="/pricing" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Tarifs</a>
            <a href="/login" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>Connexion</a>
            <a href="/signup" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>Inscription</a>
          </div>
        </div>
      </footer>

      <style>{`
        @media (min-width: 640px) {
          .landing-nav-link { display: inline !important; }
        }
      `}</style>
    </div>
  )
}
