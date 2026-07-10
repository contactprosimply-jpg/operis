// ============================================================
// OPERIS — lib/mail-i18n.ts
// Génère les emails automatiques (consultation, relance) dans la langue
// du fournisseur, à partir du champ libre `suppliers.language`.
// ============================================================

export type MailLocale = 'fr' | 'en' | 'sr' | 'de' | 'es' | 'it' | 'pt' | 'nl'

const LOCALE_ALIASES: Record<Exclude<MailLocale, 'fr'>, string[]> = {
  en: ['en', 'eng', 'english', 'anglais', 'angleterre', 'uk', 'united kingdom', 'usa', 'us', 'gb'],
  sr: ['sr', 'srb', 'serbian', 'serbe', 'serbie', 'srpski', 'serbia'],
  de: ['de', 'deu', 'german', 'allemand', 'allemagne', 'deutsch', 'germany'],
  es: ['es', 'spa', 'spanish', 'espagnol', 'espagne', 'español', 'spain'],
  it: ['it', 'ita', 'italian', 'italien', 'italie', 'italiano', 'italy'],
  pt: ['pt', 'por', 'portuguese', 'portugais', 'portugal'],
  nl: ['nl', 'nld', 'dutch', 'néerlandais', 'neerlandais', 'hollandais', 'netherlands', 'pays-bas'],
}

/** Déduit une langue d'email à partir du champ libre "Langue" du fournisseur. Défaut : français. */
export function normalizeSupplierLanguage(raw: string | null | undefined): MailLocale {
  const v = raw?.trim().toLowerCase()
  if (!v) return 'fr'
  for (const [locale, aliases] of Object.entries(LOCALE_ALIASES) as [Exclude<MailLocale, 'fr'>, string[]][]) {
    if (aliases.some(alias => v === alias || v.includes(alias))) return locale
  }
  return 'fr'
}

interface LocaleStrings {
  dateLocale: string
  greeting: (name?: string) => string
  consultationSubject: (title: string) => string
  consultationIntro: string
  nameLabel: string
  deadlineLabel: string
  consultationClosing: string
  relaunchSubject: (title: string) => string
  relaunchIntro: string
  projectLabel: string
  clientLabel: string
  relaunchAsk: string
  relaunchWarning: string
  signoff: string
  team: string
}

const STRINGS: Record<MailLocale, LocaleStrings> = {
  fr: {
    dateLocale: 'fr-FR',
    greeting: name => (name ? `Bonjour ${name},` : 'Bonjour,'),
    consultationSubject: title => `Consultation — ${title}`,
    consultationIntro: 'Je vous consulte pour ce dossier :',
    nameLabel: 'Nom : ',
    deadlineLabel: 'Date limite : ',
    consultationClosing: 'Merci de votre retour.',
    relaunchSubject: title => `Relance — ${title}`,
    relaunchIntro: "Sauf erreur de notre part, nous n'avons pas encore reçu votre devis concernant le projet suivant :",
    projectLabel: 'Projet : ',
    clientLabel: 'Client : ',
    relaunchAsk: 'Pourriez-vous nous faire parvenir votre offre dans les meilleurs délais ?',
    relaunchWarning: "Sans réponse de votre part, nous serons contraints de poursuivre notre consultation avec d'autres prestataires.",
    signoff: 'Cordialement,',
    team: "L'équipe Operis",
  },
  en: {
    dateLocale: 'en-GB',
    greeting: name => (name ? `Hello ${name},` : 'Hello,'),
    consultationSubject: title => `Quote request — ${title}`,
    consultationIntro: 'We would like to request a quote for the following project:',
    nameLabel: 'Name: ',
    deadlineLabel: 'Deadline: ',
    consultationClosing: 'Thank you for your response.',
    relaunchSubject: title => `Follow-up — ${title}`,
    relaunchIntro: 'As far as we can tell, we have not yet received your quote for the following project:',
    projectLabel: 'Project: ',
    clientLabel: 'Client: ',
    relaunchAsk: 'Could you please send us your offer as soon as possible?',
    relaunchWarning: 'Without a response from you, we will be forced to continue our consultation with other suppliers.',
    signoff: 'Best regards,',
    team: 'The Operis team',
  },
  sr: {
    dateLocale: 'sr-RS',
    greeting: name => (name ? `Poštovani ${name},` : 'Poštovani,'),
    consultationSubject: title => `Upit za ponudu — ${title}`,
    consultationIntro: 'Šaljemo vam upit za ponudu za sledeći projekat:',
    nameLabel: 'Naziv: ',
    deadlineLabel: 'Rok: ',
    consultationClosing: 'Hvala na odgovoru.',
    relaunchSubject: title => `Podsetnik — ${title}`,
    relaunchIntro: 'Ukoliko se ne varamo, još uvek nismo primili vašu ponudu za sledeći projekat:',
    projectLabel: 'Projekat: ',
    clientLabel: 'Klijent: ',
    relaunchAsk: 'Da li biste mogli da nam pošaljete ponudu u najkraćem roku?',
    relaunchWarning: 'Ukoliko ne dobijemo odgovor, bićemo primorani da nastavimo konsultacije sa drugim dobavljačima.',
    signoff: 'Srdačan pozdrav,',
    team: 'Operis tim',
  },
  de: {
    dateLocale: 'de-DE',
    greeting: name => (name ? `Hallo ${name},` : 'Hallo,'),
    consultationSubject: title => `Angebotsanfrage — ${title}`,
    consultationIntro: 'Wir bitten Sie um ein Angebot für folgendes Projekt:',
    nameLabel: 'Name: ',
    deadlineLabel: 'Frist: ',
    consultationClosing: 'Vielen Dank für Ihre Rückmeldung.',
    relaunchSubject: title => `Erinnerung — ${title}`,
    relaunchIntro: 'Soweit wir sehen, haben wir Ihr Angebot für folgendes Projekt noch nicht erhalten:',
    projectLabel: 'Projekt: ',
    clientLabel: 'Kunde: ',
    relaunchAsk: 'Könnten Sie uns Ihr Angebot so schnell wie möglich zusenden?',
    relaunchWarning: 'Ohne Rückmeldung Ihrerseits sind wir gezwungen, unsere Konsultation mit anderen Anbietern fortzusetzen.',
    signoff: 'Mit freundlichen Grüßen,',
    team: 'Das Operis-Team',
  },
  es: {
    dateLocale: 'es-ES',
    greeting: name => (name ? `Hola ${name},` : 'Hola,'),
    consultationSubject: title => `Solicitud de presupuesto — ${title}`,
    consultationIntro: 'Le solicitamos un presupuesto para el siguiente proyecto:',
    nameLabel: 'Nombre: ',
    deadlineLabel: 'Fecha límite: ',
    consultationClosing: 'Gracias por su respuesta.',
    relaunchSubject: title => `Recordatorio — ${title}`,
    relaunchIntro: 'Salvo error por nuestra parte, aún no hemos recibido su presupuesto para el siguiente proyecto:',
    projectLabel: 'Proyecto: ',
    clientLabel: 'Cliente: ',
    relaunchAsk: '¿Podría enviarnos su oferta lo antes posible?',
    relaunchWarning: 'Sin respuesta de su parte, nos veremos obligados a continuar nuestra consulta con otros proveedores.',
    signoff: 'Saludos cordiales,',
    team: 'El equipo de Operis',
  },
  it: {
    dateLocale: 'it-IT',
    greeting: name => (name ? `Buongiorno ${name},` : 'Buongiorno,'),
    consultationSubject: title => `Richiesta di preventivo — ${title}`,
    consultationIntro: 'Le richiediamo un preventivo per il seguente progetto:',
    nameLabel: 'Nome: ',
    deadlineLabel: 'Scadenza: ',
    consultationClosing: 'Grazie per la sua risposta.',
    relaunchSubject: title => `Sollecito — ${title}`,
    relaunchIntro: 'Salvo nostro errore, non abbiamo ancora ricevuto il suo preventivo per il seguente progetto:',
    projectLabel: 'Progetto: ',
    clientLabel: 'Cliente: ',
    relaunchAsk: 'Potrebbe inviarci la sua offerta il prima possibile?',
    relaunchWarning: 'In assenza di risposta, saremo costretti a proseguire la consultazione con altri fornitori.',
    signoff: 'Cordiali saluti,',
    team: 'Il team Operis',
  },
  pt: {
    dateLocale: 'pt-PT',
    greeting: name => (name ? `Olá ${name},` : 'Olá,'),
    consultationSubject: title => `Pedido de orçamento — ${title}`,
    consultationIntro: 'Solicitamos um orçamento para o seguinte projeto:',
    nameLabel: 'Nome: ',
    deadlineLabel: 'Prazo: ',
    consultationClosing: 'Obrigado pela sua resposta.',
    relaunchSubject: title => `Lembrete — ${title}`,
    relaunchIntro: 'Salvo engano da nossa parte, ainda não recebemos o seu orçamento para o seguinte projeto:',
    projectLabel: 'Projeto: ',
    clientLabel: 'Cliente: ',
    relaunchAsk: 'Poderia enviar-nos a sua proposta o mais rápido possível?',
    relaunchWarning: 'Sem resposta da sua parte, seremos obrigados a continuar a nossa consulta com outros fornecedores.',
    signoff: 'Atenciosamente,',
    team: 'A equipa Operis',
  },
  nl: {
    dateLocale: 'nl-NL',
    greeting: name => (name ? `Hallo ${name},` : 'Hallo,'),
    consultationSubject: title => `Offerteaanvraag — ${title}`,
    consultationIntro: 'Wij vragen u een offerte voor het volgende project:',
    nameLabel: 'Naam: ',
    deadlineLabel: 'Deadline: ',
    consultationClosing: 'Bedankt voor uw reactie.',
    relaunchSubject: title => `Herinnering — ${title}`,
    relaunchIntro: 'Voor zover wij weten hebben wij uw offerte voor het volgende project nog niet ontvangen:',
    projectLabel: 'Project: ',
    clientLabel: 'Klant: ',
    relaunchAsk: 'Zou u ons uw aanbod zo snel mogelijk kunnen toesturen?',
    relaunchWarning: 'Zonder reactie van uw kant zullen wij genoodzaakt zijn onze consultatie met andere leveranciers voort te zetten.',
    signoff: 'Met vriendelijke groet,',
    team: 'Het Operis-team',
  },
}

export function buildConsultationSubjectForLocale(title: string, locale: MailLocale): string {
  return STRINGS[locale].consultationSubject(title)
}

export function buildConsultationBodyForLocale(
  tender: { title: string; client: string; deadline?: string | null },
  supplierName: string | undefined,
  locale: MailLocale,
  extraMessage?: string,
): string {
  const s = STRINGS[locale]
  const lines = [s.greeting(supplierName), '', s.consultationIntro, `${s.nameLabel}${tender.title}`]
  if (tender.deadline) {
    lines.push(`${s.deadlineLabel}${new Date(tender.deadline).toLocaleDateString(s.dateLocale)}`)
  }
  lines.push('', s.consultationClosing)
  const base = lines.join('\n')
  return extraMessage?.trim() ? `${base}\n\n${extraMessage.trim()}` : base
}

export function buildRelaunchSubjectForLocale(title: string, locale: MailLocale): string {
  return STRINGS[locale].relaunchSubject(title)
}

export function buildRelaunchBodyForLocale(
  tender: { title: string; client: string; deadline?: string | null },
  supplierName: string,
  relaunchCount: number,
  locale: MailLocale,
): string {
  const s = STRINGS[locale]
  const lines = [
    s.greeting(supplierName),
    '',
    s.relaunchIntro,
    '',
    `${s.projectLabel}${tender.title}`,
    `${s.clientLabel}${tender.client}`,
  ]
  if (tender.deadline) {
    lines.push(`${s.deadlineLabel}${new Date(tender.deadline).toLocaleDateString(s.dateLocale)}`)
  }
  lines.push('', s.relaunchAsk)
  if (relaunchCount >= 2) lines.push('', s.relaunchWarning)
  lines.push('', s.signoff, s.team)
  return lines.join('\n')
}
