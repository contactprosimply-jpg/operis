export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { clampString, badRequest } from '@/lib/api-validation'
import { completeSignupOnboarding } from '@/lib/auth-onboarding'

const TERMS_VERSION = '1.0'

function mapSignupError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.'
  }
  if (lower.includes('password')) return 'Mot de passe invalide (minimum 8 caractères).'
  if (lower.includes('email')) return 'Adresse email invalide.'
  return message
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Corps JSON requis')

  const firstName = clampString(body.first_name, 80)?.trim() ?? ''
  const lastName = clampString(body.last_name, 80)?.trim() ?? ''
  const email = clampString(body.email, 320)?.toLowerCase().trim() ?? ''
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordConfirm = typeof body.password_confirm === 'string' ? body.password_confirm : ''
  const companyName = clampString(body.company_name, 200)?.trim() ?? ''
  const termsAccepted = body.terms_accepted === true

  if (firstName.length < 1 || lastName.length < 1) {
    return badRequest('Prénom et nom requis')
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return badRequest('Email invalide')
  }
  if (password.length < 8) {
    return badRequest('Le mot de passe doit contenir au moins 8 caractères')
  }
  if (password !== passwordConfirm) {
    return badRequest('Les mots de passe ne correspondent pas')
  }
  if (companyName.length < 2) {
    return badRequest('Nom de l\'entreprise requis (2 caractères minimum)')
  }
  if (!termsAccepted) {
    return badRequest('Vous devez accepter les conditions d\'utilisation')
  }

  const fullName = `${firstName} ${lastName}`.trim()
  const acceptedAt = new Date().toISOString()
  const skipEmailConfirm = process.env.SIGNUP_SKIP_EMAIL_CONFIRMATION === 'true'

  const db = createAdminClient()
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: skipEmailConfirm,
    user_metadata: {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      company_name: companyName,
      terms_accepted_at: acceptedAt,
      terms_version: TERMS_VERSION,
    },
  })

  if (error || !data.user) {
    return Response.json(
      { success: false, error: mapSignupError(error?.message ?? 'Inscription impossible') },
      { status: 400 },
    )
  }

  try {
    await completeSignupOnboarding(db, data.user.id, { fullName, companyName, email })
    await db
      .from('profiles')
      .update({ terms_accepted_at: acceptedAt, terms_version: TERMS_VERSION })
      .eq('id', data.user.id)
  } catch (err) {
    await db.auth.admin.deleteUser(data.user.id).catch(() => null)
    const message = err instanceof Error ? err.message : 'Erreur création profil'
    return Response.json({ success: false, error: message }, { status: 500 })
  }

  const needsEmailConfirmation = !skipEmailConfirm && !data.user.email_confirmed_at

  return Response.json({
    success: true,
    data: {
      user_id: data.user.id,
      email,
      needs_email_confirmation: needsEmailConfirmation,
    },
  })
}
