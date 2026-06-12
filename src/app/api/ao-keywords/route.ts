export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  type AoKeywordCategory,
  listAoKeywords,
  restoreDefaultAoKeywords,
} from '@/lib/ao-keywords'

const CATEGORIES: AoKeywordCategory[] = [
  'detection', 'question', 'reponse', 'relance', 'refus', 'acceptation',
]

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const keywords = await listAoKeywords(db)
  return Response.json({ success: true, data: keywords })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json() as Record<string, unknown>
  const action = body.action as string | undefined

  const db = createAdminClient()

  if (action === 'restore_defaults') {
    try {
      const data = await restoreDefaultAoKeywords(db)
      return Response.json({ success: true, data })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur restauration'
      return Response.json({ success: false, error: message }, { status: 500 })
    }
  }

  const keyword = typeof body.keyword === 'string' ? body.keyword.trim().toLowerCase() : ''
  const category = body.category as AoKeywordCategory
  const weight = Number(body.weight)

  if (!keyword || keyword.length < 2) {
    return Response.json({ success: false, error: 'Mot clé invalide' }, { status: 400 })
  }
  if (!CATEGORIES.includes(category)) {
    return Response.json({ success: false, error: 'Catégorie invalide' }, { status: 400 })
  }
  const w = Number.isFinite(weight) ? Math.min(5, Math.max(1, Math.round(weight))) : 1

  const { data, error } = await db
    .from('ao_keywords')
    .insert({ keyword, category, weight: w })
    .select('*')
    .single()

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 400 })
  }
  return Response.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ success: false, error: 'id requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db.from('ao_keywords').delete().eq('id', id)
  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }
  return Response.json({ success: true })
}
