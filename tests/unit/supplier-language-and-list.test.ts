import { describe, it, expect } from 'vitest'
import { normalizeSupplierLanguage } from '@/lib/mail-i18n'
import { SUPPLIER_LANGUAGES } from '@/lib/supplier-languages'
import { groupByFamily, sortFlat, TODO_FAMILY_ID } from '@/components/suppliers/supplier-list-model'
import type { CorpsEtat, Supplier } from '@/types/database'

describe('langue des e-mails fournisseur', () => {
  it('chaque langue de la liste envoie dans la bonne langue (Italien ne devient plus anglais)', () => {
    expect(SUPPLIER_LANGUAGES.map(l => normalizeSupplierLanguage(l))).toEqual(['fr', 'en', 'es', 'de', 'it', 'pt', 'sr', 'fr'])
  })
  it('garde la reconnaissance des anciennes saisies libres', () => {
    expect(normalizeSupplierLanguage('Serbe / Anglais')).toBe('en')
    expect(normalizeSupplierLanguage('')).toBe('fr')
  })
})

const ce = (id: string, sort_order: number): CorpsEtat => ({ id, label: id, sort_order })
const sup = (id: string, name: string, corps: string[], rate: number | null): Supplier => ({
  id, name, corps_etats: corps,
  response_rate: rate === null ? null : { responded: rate * 10, contacted: 10, rate },
} as Supplier)

describe('liste fournisseurs par famille', () => {
  const nomenclature = [ce('plomberie', 20), ce('electricite', 10)]
  const list = [sup('a', 'Zed', ['plomberie', 'electricite'], 0.9), sup('b', 'Alpha', [], null), sup('c', 'Beta', ['plomberie'], 0.4)]

  it('À classer en premier, puis ordre de la nomenclature ; multi-corps présent dans chaque famille', () => {
    const fams = groupByFamily(list, nomenclature)
    expect(fams.map(f => f.id)).toEqual([TODO_FAMILY_ID, 'electricite', 'plomberie'])
    expect(fams[2].suppliers.map(s => s.id)).toEqual(['c', 'a'])
  })
  it('pas de famille « À classer » quand tout est classé', () => {
    expect(groupByFamily(list.filter(s => s.id !== 'b'), nomenclature)[0].id).toBe('electricite')
  })
  it('tri réactivité : taux décroissant, jamais consulté en dernier', () => {
    expect(sortFlat(list, 'reactivity').map(s => s.id)).toEqual(['a', 'c', 'b'])
  })
})
