/**
 * Sync IMAP multi-dossiers (aligné sur src/lib/mail-sync.ts).
 * Usage : npm run sync
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { syncUserMailAccounts } from '../src/lib/mail-sync'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(1)
}

const db = createClient(url, key)
const filterUser = process.env.SYNC_USER_ID

async function main() {
  let q = db.from('mail_accounts').select('user_id').eq('is_active', true)
  if (filterUser) q = q.eq('user_id', filterUser)
  const { data: accounts } = await q

  const userIds = [...new Set((accounts ?? []).map(a => a.user_id))]
  if (!userIds.length) {
    console.log('Aucun compte mail actif.')
    return
  }

  for (const userId of userIds) {
    console.log(`\n── Sync user ${userId} ──`)
    try {
      const result = await syncUserMailAccounts(userId, { backfill: true, quick: false })
      console.log(
        `fetched=${result.fetched} stored=${result.stored} updated=${result.updated} errors=${result.errors}`,
      )
      if (result.mailboxes?.custom?.length) {
        console.log(`dossiers perso: ${result.mailboxes.custom.join(', ')}`)
      }
    } catch (e) {
      console.error('Erreur:', e)
    }
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
