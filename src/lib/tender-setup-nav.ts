/** URL de la fiche AO avec modale de configuration initiale (après création). */
export function tenderSetupUrl(tenderId: string): string {
  return `/tenders/${tenderId}?setup=1`
}

export function isTenderSetupQuery(searchParams: URLSearchParams): boolean {
  return searchParams.get('setup') === '1'
}
