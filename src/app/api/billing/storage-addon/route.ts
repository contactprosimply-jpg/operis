export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveBillingOrg } from '@/lib/billing/subscription'
import { getStripe, getStripeStorageAddonPriceId } from '@/lib/billing/stripe'
import { upsertFromStripeSubscription } from '@/lib/billing/upsert-subscription'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const addonPriceId = getStripeStorageAddonPriceId()
  if (!addonPriceId) {
    return Response.json({ success: false, error: 'Option stockage non configurée' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const units = Number(body?.units)
  if (!Number.isInteger(units) || units < 0 || units > 50) {
    return Response.json({ success: false, error: 'Nombre d\'unités invalide' }, { status: 400 })
  }

  const db = createAdminClient()
  const { orgId, isOwner } = await resolveBillingOrg(db, userId)
  if (!orgId || !isOwner) {
    return Response.json({
      success: false,
      error: 'Seul le créateur du groupe peut gérer la facturation',
    }, { status: 403 })
  }

  const { data: sub } = await db
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) {
    return Response.json({
      success: false,
      error: 'Souscrivez d\'abord une offre avant d\'ajouter du stockage',
    }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const existingItem = stripeSub.items.data.find(item => item.price?.id === addonPriceId)

    if (units === 0) {
      if (existingItem) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: existingItem.id, deleted: true }],
        })
      }
    } else if (existingItem) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: existingItem.id, quantity: units }],
      })
    } else {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ price: addonPriceId, quantity: units }],
      })
    }

    const updatedSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    await upsertFromStripeSubscription(updatedSub, { fallbackOrgId: orgId, fallbackUserId: userId })

    return Response.json({ success: true, data: { storage_addon_units: units } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur mise à jour Stripe'
    console.error('[billing/storage-addon]', message, err)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
