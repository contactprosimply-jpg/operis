import type { SupabaseClient } from '@supabase/supabase-js'

export async function autoLinkEmailToTender(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  subject: string,
): Promise<string | null> {
  const subjectLower = subject.toLowerCase()
  if (!subjectLower.trim()) return null

  const { data: tenders } = await db
    .from('tenders')
    .select('id, title')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)

  for (const tender of tenders ?? []) {
    const title = (tender.title ?? '').toLowerCase().trim()
    if (!title) continue
    const snippet = title.length >= 10 ? title.slice(0, 10) : title
    if (subjectLower.includes(title) || (snippet.length >= 6 && subjectLower.includes(snippet))) {
      await db.from('emails').update({ tender_id: tender.id }).eq('id', emailId).eq('user_id', userId)
      return tender.id
    }
  }
  return null
}

export async function applyTenderStatusFromDetection(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  category: string | null | undefined,
): Promise<void> {
  if (category === 'acceptation') {
    await db.from('tenders').update({ status: 'gagne' }).eq('id', tenderId).eq('user_id', userId)
  } else if (category === 'refus') {
    await db.from('tenders').update({ status: 'perdu' }).eq('id', tenderId).eq('user_id', userId)
  }
}
