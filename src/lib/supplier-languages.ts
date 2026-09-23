import { normalizeSupplierLanguage, type MailLocale } from '@/lib/mail-i18n'

// Valeurs stockées dans suppliers.language (texte libre en base) : ce sont des libellés que
// normalizeSupplierLanguage reconnaît, donc le choix change réellement la langue des e-mails.
export const SUPPLIER_LANGUAGES = ['Français', 'Anglais', 'Espagnol', 'Allemand', 'Italien', 'Portugais', 'Serbe', 'Autre'] as const

const LOCALE_LABEL: Record<MailLocale, string> = {
  fr: 'français', en: 'anglais', sr: 'serbe', de: 'allemand', es: 'espagnol', it: 'italien', pt: 'portugais', nl: 'néerlandais',
}

/** Langue réellement utilisée pour les e-mails automatiques (consultation, relance). */
export function effectiveMailLanguageLabel(language: string | null | undefined): string {
  return LOCALE_LABEL[normalizeSupplierLanguage(language)]
}
