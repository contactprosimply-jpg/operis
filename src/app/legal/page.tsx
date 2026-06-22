import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mentions légales — Operis',
  description: 'CGU, CGV et Politique de confidentialité Operis',
}

const NAV = [
  { id: 'cgu', label: 'CGU' },
  { id: 'cgv', label: 'CGV' },
  { id: 'confidentialite', label: 'Confidentialité' },
  { id: 'mentions', label: 'Mentions légales' },
] as const

const sectionStyle: React.CSSProperties = {
  marginBottom: 48,
  scrollMarginTop: 88,
}

const h2Style: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#021246',
  marginBottom: 20,
  paddingBottom: 10,
  borderBottom: '2px solid #FFB400',
}

const h3Style: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#021246',
  marginTop: 20,
  marginBottom: 8,
}

const pStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: '#334155',
  margin: '0 0 12px',
}

export default function LegalPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{
        background: '#021246',
        color: '#fff',
        padding: '20px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 2px 12px rgba(2,18,70,0.15)',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Link href="/" style={{ color: '#FFB400', textDecoration: 'none', fontWeight: 700, fontSize: 18 }}>
            Operis
          </Link>
          <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {NAV.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textDecoration: 'none' }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#021246', marginBottom: 8 }}>
          Documents légaux
        </h1>
        <p style={{ ...pStyle, marginBottom: 40 }}>
          Version 1.0 — Dernière mise à jour : {new Date().getFullYear()}
        </p>

        <section id="cgu" style={sectionStyle}>
          <h2 style={h2Style}>Conditions Générales d&apos;Utilisation – OPERIS — Version 1.0</h2>

          <h3 style={h3Style}>1. Objet</h3>
          <p style={pStyle}>
            OPERIS est une plateforme de gestion d&apos;appels d&apos;offres et de suivi des consultations
            permettant la détection, le classement et le suivi des opportunités commerciales liées aux
            opérations de construction. L&apos;utilisation de la plateforme implique l&apos;acceptation pleine et
            entière des présentes CGU.
          </p>

          <h3 style={h3Style}>2. Accès au service</h3>
          <p style={pStyle}>
            L&apos;accès à OPERIS est réservé aux utilisateurs disposant d&apos;un compte valide. L&apos;utilisateur est
            responsable de la confidentialité de ses identifiants de connexion.
          </p>

          <h3 style={h3Style}>3. Données du Client</h3>
          <p style={pStyle}>
            L&apos;ensemble des données déposées sur OPERIS demeure la propriété exclusive du Client. OPERIS ne
            revend ni ne partage les données à des fins commerciales.
          </p>

          <h3 style={h3Style}>4. Disponibilité</h3>
          <p style={pStyle}>
            OPERIS s&apos;efforce d&apos;assurer une disponibilité maximale du service mais ne garantit pas une
            disponibilité ininterrompue. Des opérations de maintenance peuvent entraîner une interruption
            temporaire du service.
          </p>

          <h3 style={h3Style}>5. Responsabilités</h3>
          <p style={pStyle}>
            OPERIS fournit un outil de gestion. Le Client demeure seul responsable : des informations saisies ;
            des documents importés ; des décisions prises sur la base des données présentes dans la plateforme.
          </p>

          <h3 style={h3Style}>6. Propriété intellectuelle</h3>
          <p style={pStyle}>
            Le logiciel OPERIS, son interface, ses logos, ses bases de données et son contenu sont protégés
            par le droit de la propriété intellectuelle. Toute reproduction ou copie non autorisée est interdite.
          </p>

          <h3 style={h3Style}>7. Résiliation</h3>
          <p style={pStyle}>
            Le Client peut résilier son abonnement à tout moment selon les modalités prévues dans les CGV.
          </p>
        </section>

        <section id="cgv" style={sectionStyle}>
          <h2 style={h2Style}>Conditions Générales de Vente – OPERIS — Version 1.0</h2>

          <h3 style={h3Style}>1. Abonnement</h3>
          <p style={pStyle}>
            OPERIS est proposé sous forme d&apos;abonnement mensuel ou annuel. Le tarif applicable est celui affiché
            sur le site au moment de la souscription.
          </p>

          <h3 style={h3Style}>2. Facturation</h3>
          <p style={pStyle}>
            Les abonnements sont facturés à l&apos;avance. Toute période commencée reste due.
          </p>

          <h3 style={h3Style}>3. Paiement</h3>
          <p style={pStyle}>
            Le paiement est effectué via un prestataire sécurisé. En cas d&apos;échec de paiement, OPERIS peut
            suspendre l&apos;accès au service après notification.
          </p>

          <h3 style={h3Style}>4. Évolution des tarifs</h3>
          <p style={pStyle}>
            OPERIS se réserve le droit de modifier ses tarifs. Les abonnés existants seront informés au minimum
            30 jours avant l&apos;application d&apos;un nouveau tarif.
          </p>

          <h3 style={h3Style}>5. Résiliation</h3>
          <p style={pStyle}>
            Le Client peut résilier son abonnement à tout moment. La résiliation prend effet à la fin de la
            période d&apos;abonnement en cours.
          </p>

          <h3 style={h3Style}>6. Limitation de responsabilité</h3>
          <p style={pStyle}>
            La responsabilité d&apos;OPERIS est limitée au montant des sommes effectivement payées par le Client au
            cours des douze derniers mois. OPERIS ne pourra être tenu responsable des pertes indirectes, pertes
            d&apos;exploitation ou pertes de données imputables à une mauvaise utilisation du service.
          </p>
        </section>

        <section id="confidentialite" style={sectionStyle}>
          <h2 style={h2Style}>Politique de Confidentialité – OPERIS — Version 1.0</h2>

          <h3 style={h3Style}>Données collectées</h3>
          <p style={pStyle}>
            OPERIS peut collecter : nom et prénom ; adresse e-mail ; numéro de téléphone ; nom de société ;
            données de connexion ; documents importés ; courriels synchronisés et pièces jointes liés aux
            appels d&apos;offres.
          </p>

          <h3 style={h3Style}>Finalités</h3>
          <p style={pStyle}>
            Ces données sont utilisées pour : fournir le service OPERIS ; gérer les comptes utilisateurs ;
            assurer la sécurité de la plateforme ; réaliser la facturation ; fournir une assistance technique.
          </p>

          <h3 style={h3Style}>Conservation</h3>
          <p style={pStyle}>
            Les données sont conservées pendant la durée de l&apos;abonnement puis pendant la durée légale
            nécessaire au respect des obligations réglementaires.
          </p>

          <h3 style={h3Style}>Droits des utilisateurs</h3>
          <p style={pStyle}>
            Conformément au RGPD, chaque utilisateur dispose des droits suivants : accès ; rectification ;
            suppression ; portabilité ; limitation du traitement ; opposition. Toute demande peut être adressée
            à l&apos;adresse de contact figurant dans les mentions légales.
          </p>

          <h3 style={h3Style}>Hébergement</h3>
          <p style={pStyle}>
            Les données sont hébergées auprès de prestataires reconnus répondant aux standards de sécurité du
            marché (Vercel pour l&apos;application, Supabase pour la base de données).
          </p>

          <h3 style={h3Style}>Confidentialité</h3>
          <p style={pStyle}>
            Les données des Clients ne sont jamais vendues ni utilisées à des fins publicitaires.
          </p>
        </section>

        <section id="mentions" style={sectionStyle}>
          <h2 style={h2Style}>Mentions légales</h2>
          <p style={pStyle}>
            <strong>Éditeur :</strong> Operis — [Raison sociale à compléter] — SIRET [à compléter]
          </p>
          <p style={pStyle}>
            <strong>Contact :</strong> [adresse e-mail de contact à compléter]
          </p>
          <p style={pStyle}>
            <strong>Hébergeur application :</strong> Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis
          </p>
          <p style={pStyle}>
            <strong>Hébergeur données :</strong> Supabase Inc.
          </p>
        </section>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
          <Link href="/" style={{ color: '#021246', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    </div>
  )
}
