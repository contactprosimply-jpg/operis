export type BillingPlan = 'pro' | 'business'

export interface PlanLimits {
  seats: number
  storageGb: number
}

export function planLimits(plan: BillingPlan | null): PlanLimits {
  if (plan === 'business') return { seats: 5, storageGb: 50 }
  if (plan === 'pro') return { seats: 2, storageGb: 20 }
  return { seats: 0, storageGb: 0 }
}

export function storageLimitBytes(plan: BillingPlan | null): number {
  return planLimits(plan).storageGb * 1024 * 1024 * 1024
}

/** Chaque unité d'option achetée ajoute ce volume, en plus du quota de base du plan. */
export const STORAGE_ADDON_GB_PER_UNIT = 10

export function effectiveStorageGb(plan: BillingPlan | null, addonUnits: number): number {
  return planLimits(plan).storageGb + Math.max(0, addonUnits) * STORAGE_ADDON_GB_PER_UNIT
}

export function effectiveStorageLimitBytes(plan: BillingPlan | null, addonUnits: number): number {
  return effectiveStorageGb(plan, addonUnits) * 1024 * 1024 * 1024
}
