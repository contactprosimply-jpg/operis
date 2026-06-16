export type BillingPlan = 'pro' | 'business'

export interface PlanLimits {
  seats: number
  storageGb: number
}

export function planLimits(plan: BillingPlan | null): PlanLimits {
  if (plan === 'business') return { seats: 5, storageGb: 50 }
  return { seats: 2, storageGb: 20 }
}

export function storageLimitBytes(plan: BillingPlan | null): number {
  return planLimits(plan).storageGb * 1024 * 1024 * 1024
}
