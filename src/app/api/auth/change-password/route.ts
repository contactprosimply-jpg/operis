export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserFromRequest, getUserEmailFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { badRequest } from '@/lib/api-validation'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const email = await getUserEmailFromRequest(req)
  if (!email) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Corps JSON requis')

  const currentPassword = typeof body.current_password === 'string' ? body.current_password : ''
  const newPassword = typeof body.new_password === 'string' ? body.new_password : ''

  if (!currentPassword) return badRequest('Mot de passe actuel requis')
  if (newPassword.length < 8) return badRequest('Le nouveau mot de passe doit contenir au moins 8 caractères')
  if (currentPassword === newPassword) return badRequest('Le nouveau mot de passe doit être différent')

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error: signInError } = await anon.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (signInError) {
    return Response.json({ success: false, error: 'Mot de passe actuel incorrect' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (updateError) {
    return Response.json({ success: false, error: updateError.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
