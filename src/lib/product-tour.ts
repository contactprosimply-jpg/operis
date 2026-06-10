export const TOUR_DONE_KEY = 'operis_product_tour_done'
export const TOUR_START_KEY = 'operis_start_tour'

export interface ProductTourStep {
  id: string
  route: string
  target?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

export const PRODUCT_TOUR_STEPS: ProductTourStep[] = [
  {
    id: 'welcome',
    route: '/dashboard',
    title: 'Bienvenue sur Operis 👋',
    body: 'Ce guide interactif vous montre les zones clés de l’application. Suivez les étapes pour maîtriser Operis en quelques minutes.',
    placement: 'center',
  },
  {
    id: 'kpis',
    route: '/dashboard',
    target: 'dashboard-kpis',
    title: 'Vos indicateurs',
    body: 'AO actifs, taux de réponse fournisseurs, devis reçus et taux de réussite — tout votre pilotage commercial en un coup d’œil.',
    placement: 'bottom',
  },
  {
    id: 'ao-table',
    route: '/dashboard',
    target: 'dashboard-ao-table',
    title: 'AO en cours',
    body: 'Cliquez sur une ligne pour ouvrir le dossier : fournisseurs, devis, documents et comparatif.',
    placement: 'top',
  },
  {
    id: 'nav-tenders',
    route: '/dashboard',
    target: 'nav-tenders',
    title: 'Menu Appels d’offres',
    body: 'Accédez à la liste complète de vos AO, créez de nouveaux dossiers et filtrez par statut.',
    placement: 'right',
  },
  {
    id: 'tenders-create',
    route: '/tenders',
    target: 'tenders-create',
    title: 'Créer un AO',
    body: 'Définissez titre, client, deadline et budget. Vous pouvez aussi créer un AO depuis un email reçu.',
    placement: 'left',
  },
  {
    id: 'nav-suppliers',
    route: '/tenders',
    target: 'nav-suppliers',
    title: 'Fournisseurs',
    body: 'Votre carnet d’adresses BTP : nom, email, spécialité. Indispensable avant toute consultation.',
    placement: 'right',
  },
  {
    id: 'suppliers-add',
    route: '/suppliers',
    target: 'suppliers-add',
    title: 'Ajouter un fournisseur',
    body: 'Enregistrez vos artisans et entreprises partenaires. Ils seront proposés lors des consultations AO.',
    placement: 'left',
  },
  {
    id: 'nav-mail',
    route: '/suppliers',
    target: 'nav-mail',
    title: 'Messagerie',
    body: 'Operis détecte automatiquement les AO et devis dans vos emails. Synchronisation IMAP toutes les 5 minutes.',
    placement: 'right',
  },
  {
    id: 'mail-sync',
    route: '/mail',
    target: 'mail-sync',
    title: 'Synchroniser',
    body: 'Forcez une synchro immédiate ou attendez l’auto-sync. Les emails AO non liés apparaissent ici.',
    placement: 'bottom',
  },
  {
    id: 'nav-notifications',
    route: '/mail',
    target: 'nav-notifications',
    title: 'Alertes & notifications',
    body: 'Deadlines J-7 et J-2, devis manquants… Operis vous alerte avant qu’il soit trop tard.',
    placement: 'right',
  },
  {
    id: 'nav-settings',
    route: '/mail',
    target: 'nav-settings',
    title: 'Paramètres',
    body: 'Messagerie IMAP/SMTP, signature email, thème et équipe — configurez Operis à votre image.',
    placement: 'right',
  },
  {
    id: 'settings-messagerie',
    route: '/settings',
    target: 'settings-messagerie',
    title: 'Configuration mail',
    body: 'Connectez Gandi, Gmail ou Outlook. Testez la connexion avant de consulter vos fournisseurs.',
    placement: 'bottom',
  },
  {
    id: 'finish',
    route: '/settings',
    title: 'Vous êtes prêt ! 🚀',
    body: 'Vous connaissez les bases d’Operis. Créez un AO, consultez vos fournisseurs et ne ratez plus une opportunité.',
    placement: 'center',
  },
]

export function requestProductTour() {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOUR_START_KEY, '1')
  localStorage.removeItem(TOUR_DONE_KEY)
  window.dispatchEvent(new Event('operis-start-tour'))
}

export function markProductTourDone() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    localStorage.removeItem(TOUR_START_KEY)
  }
}

export function shouldAutoStartTour(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(TOUR_DONE_KEY) !== '1' && localStorage.getItem(TOUR_START_KEY) === '1'
}
