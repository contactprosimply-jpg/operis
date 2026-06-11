/**
 * Sync IMAP multi-dossiers (src/lib/mail-sync.ts).
 * Usage : npm run sync
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { listImapMailboxes } from '../src/lib/imap-client'
import { syncUserMailAccounts, mapMailAccountRow } from '../src/lib/mail-sync'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(1)
}

const db = createClient(url, key)
const filterUser = process.env.SYNC_USER_ID

async function listBoxesForAccounts() {
  let q = db.from('mail_accounts').select('*').eq('is_active', true)
  if (filterUser) q = q.eq('user_id', filterUser)
  const { data: accounts } = await q

  for (const row of accounts ?? []) {
    const account = mapMailAccountRow(row)
    if (!account) continue
    console.log(`\n══ Dossiers IMAP pour ${account.imap_user} ══`)
    try {
      const boxes = await listImapMailboxes(account)
      console.log(JSON.stringify(boxes, null, 2))
    } catch (e) {
      console.error('listBoxes erreur:', e)
    }
  }
}

async function main() {
  console.log('── listBoxes() : dossiers disponibles sur Gandi ──')
  await listBoxesForAccounts()

  let q = db.from('mail_accounts').select('user_id').eq('is_active', true)
  if (filterUser) q = q.eq('user_id', filterUser)
  const { data: accounts } = await q

  const userIds = [...new Set((accounts ?? []).map(a => a.user_id))]
  if (!userIds.length) {
    console.log('Aucun compte mail actif.')
    return
  }

  console.log('\n── Sync multi-dossiers (inbox, sent, drafts, trash, spam, custom) ──')
  for (const userId of userIds) {
    console.log(`\n── Sync user ${userId} ──`)
    try {
      const result = await syncUserMailAccounts(userId, { backfill: true, quick: false })
      console.log(
        `fetched=${result.fetched} stored=${result.stored} updated=${result.updated} errors=${result.errors}`,
      )
      if (result.mailboxes) {
        console.log('Résolu:', {
          inbox: result.mailboxes.inbox,
          sent: result.mailboxes.sent ?? '(introuvable)',
          drafts: result.mailboxes.drafts,
          trash: result.mailboxes.trash,
          spam: result.mailboxes.spam,
          custom: result.mailboxes.custom,
        })
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
