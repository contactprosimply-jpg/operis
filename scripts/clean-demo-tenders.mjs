/**
 * Supprime tous les AO des comptes démo Operis.
 * Usage: node scripts/clean-demo-tenders.mjs
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(root, '.env.local') })
dotenv.config({ path: join(root, '.env.production.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(1)
}

const DEMO_EMAILS = [
  'contact@nikodex.fr',
  'b.uros@nikodex.fr',
  'contactprosimply@gmail.com',
]

const DEVIS_BUCKET = 'devis'
const db = createClient(url, key)

async function deleteAllTendersForUser(userId) {
  const { data: docs } = await db
    .from('tender_documents')
    .select('storage_path, bucket')
    .eq('user_id', userId)

  const pathsByBucket = new Map()
  for (const doc of docs ?? []) {
    const bucket = doc.bucket ?? DEVIS_BUCKET
    const list = pathsByBucket.get(bucket) ?? []
    list.push(doc.storage_path)
    pathsByBucket.set(bucket, list)
  }

  for (const [bucket, paths] of pathsByBucket) {
    for (let i = 0; i < paths.length; i += 50) {
      await db.storage.from(bucket).remove(paths.slice(i, i + 50))
    }
  }

  const { count } = await db
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { error } = await db.from('tenders').delete().eq('user_id', userId)
  if (error) throw new Error(error.message)

  await db
    .from('emails')
    .update({ tender_id: null })
    .eq('user_id', userId)
    .not('tender_id', 'is', null)

  return count ?? 0
}

const { data: { users }, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 })
if (listErr) {
  console.error(listErr.message)
  process.exit(1)
}

let total = 0
for (const email of DEMO_EMAILS) {
  const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.log(`— ${email}: compte introuvable, ignoré`)
    continue
  }
  const n = await deleteAllTendersForUser(user.id)
  console.log(`✓ ${email}: ${n} AO supprimé(s)`)
  total += n
}

console.log(`Total: ${total} AO supprimé(s) pour la démo.`)
