import { describe, expect, it } from 'vitest'
import {
  canViewTender,
  canPatchTender,
  canDeleteTender,
  canAssignTender,
  isValidAssignee,
  type TenderAccessScope,
} from '@/lib/tender-access'

const OWNER_ID = 'owner-1'
const MEMBER_ID = 'member-1'
const OUTSIDER_ID = 'outsider-1'

function scope(overrides: Partial<TenderAccessScope> = {}): TenderAccessScope {
  return {
    userId: OWNER_ID,
    isOrgOwner: true,
    organizationId: 'org-1',
    members: [{ user_id: MEMBER_ID, display_name: 'Membre', email: 'm@x.com', color: null }],
    teamUserIds: [OWNER_ID, MEMBER_ID],
    ...overrides,
  }
}

describe('tender-access — solo (pas d\'organisation)', () => {
  const soloScope = scope({ isOrgOwner: false, organizationId: null, members: [], teamUserIds: [OWNER_ID] })

  it('voit/modifie/supprime son propre AO', () => {
    const tender = { user_id: OWNER_ID }
    expect(canViewTender(soloScope, tender)).toBe(true)
    expect(canPatchTender(soloScope, tender)).toBe(true)
    expect(canDeleteTender(soloScope, tender)).toBe(true)
  })

  it('ne voit pas l\'AO d\'un autre', () => {
    const tender = { user_id: OUTSIDER_ID }
    expect(canViewTender(soloScope, tender)).toBe(false)
  })

  it('ne peut jamais assigner (pas d\'organisation)', () => {
    expect(canAssignTender(soloScope)).toBe(false)
  })
})

describe('tender-access — créateur du groupe', () => {
  const ownerScope = scope()

  it('voit/modifie/supprime les AO de toute l\'équipe', () => {
    const tender = { user_id: MEMBER_ID }
    expect(canViewTender(ownerScope, tender)).toBe(true)
    expect(canPatchTender(ownerScope, tender)).toBe(true)
    expect(canDeleteTender(ownerScope, tender)).toBe(true)
  })

  it('ne voit pas l\'AO d\'un user hors organisation', () => {
    const tender = { user_id: OUTSIDER_ID }
    expect(canViewTender(ownerScope, tender)).toBe(false)
  })

  it('peut assigner', () => {
    expect(canAssignTender(ownerScope)).toBe(true)
  })
})

describe('isValidAssignee — coeur de la faille corrigée', () => {
  const org = scope()

  it('accepte un membre réel de l\'organisation', () => {
    expect(isValidAssignee(org, MEMBER_ID)).toBe(true)
  })

  it('accepte null (retirer l\'assignation)', () => {
    expect(isValidAssignee(org, null)).toBe(true)
  })

  it('rejette un user_id hors organisation — même bien formé, même si l\'appelant est créateur', () => {
    expect(isValidAssignee(org, OUTSIDER_ID)).toBe(false)
  })

  it('rejette n\'importe quel user_id si l\'organisation n\'a aucun membre', () => {
    const emptyOrg = scope({ members: [] })
    expect(isValidAssignee(emptyOrg, MEMBER_ID)).toBe(false)
  })
})

describe('tender-access — membre (non créateur)', () => {
  const memberScope = scope({ userId: MEMBER_ID, isOrgOwner: false })

  it('voit/modifie son propre AO', () => {
    const tender = { user_id: MEMBER_ID }
    expect(canViewTender(memberScope, tender)).toBe(true)
    expect(canPatchTender(memberScope, tender)).toBe(true)
  })

  it('voit/modifie un AO qui lui est assigné, même créé par un autre', () => {
    const tender = { user_id: OWNER_ID, assigned_to: MEMBER_ID }
    expect(canViewTender(memberScope, tender)).toBe(true)
    expect(canPatchTender(memberScope, tender)).toBe(true)
  })

  it('ne voit pas un AO du groupe qui ne lui est pas assigné', () => {
    const tender = { user_id: OWNER_ID, assigned_to: null }
    expect(canViewTender(memberScope, tender)).toBe(false)
  })

  it('ne peut jamais supprimer, même son propre AO', () => {
    const ownTender = { user_id: MEMBER_ID }
    const assignedTender = { user_id: OWNER_ID, assigned_to: MEMBER_ID }
    expect(canDeleteTender(memberScope, ownTender)).toBe(false)
    expect(canDeleteTender(memberScope, assignedTender)).toBe(false)
  })

  it('ne peut pas assigner (réservé au créateur)', () => {
    expect(canAssignTender(memberScope)).toBe(false)
  })
})
