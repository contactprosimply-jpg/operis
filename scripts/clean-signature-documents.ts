/**
 * Nettoie les documents AO qui sont des logos de signature (soft-delete).
 *
 * Dry-run (liste sans supprimer) :
 *   npx tsx scripts/clean-signature-documents.ts
 *
 * Suppression soft (deleted_at) après validation :
 *   npx tsx scripts/clean-signature-documents.ts --apply
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  isLikelySignatureTenderDocument,
  isProtectedDocumentType,
} from '../src/lib/attachment-signature-filter'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(root, '.env.local') })
dotenv.config({ path: join(root, '.env.production.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const db = createClient(url, key)
const DEVIS_BUCKET = 'devis'

type TenderDocRow = {
  id: string
  tender_id: string
  user_id: string
  filename: string
  content_type: string | null
  size: number | null
  storage_path: string
  bucket: string | null
  deleted_at: string | null
  tender?: { title?: string | null } | null
}

async function downloadDocBuffer(doc: TenderDocRow): Promise<Buffer | null> {
  const bucket = doc.bucket ?? DEVIS_BUCKET
  const { data, error } = await db.storage.from(bucket).download(doc.storage_path)
  if (error || !data) return null
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}

async function main() {
  const { data: docs, error } = await db
    .from('tender_documents')
    .select('id, tender_id, user_id, filename, content_type, size, storage_path, bucket, deleted_at, tender:tenders(title)')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Erreur lecture tender_documents:', error.message)
    process.exit(1)
  }

  const candidates: Array<{
    doc: TenderDocRow
    reason: string
  }> = []

  for (const raw of docs ?? []) {
    const doc = raw as TenderDocRow
    if (isProtectedDocumentType(doc.filename, doc.content_type ?? undefined)) continue

    let buffer: Buffer | null = null
    const needsBuffer =
      (doc.content_type?.startsWith('image/') ?? false)
      || /\.(png|jpe?g|gif|webp)/i.test(doc.filename)

    if (needsBuffer) {
      buffer = await downloadDocBuffer(doc)
    }

    if (!isLikelySignatureTenderDocument(doc, buffer)) continue

    let reason = 'heuristique signature'
    if (buffer) {
      const dims = buffer.length >= 10 ? ` (${buffer.length} o)` : ''
      reason = `image signature${dims}`
    } else if (doc.size != null && doc.size < 51200) {
      reason = `petit fichier (${doc.size} o)`
    }

    candidates.push({ doc, reason })
  }

  if (!candidates.length) {
    console.log('Aucun document signature détecté.')
    return
  }

  console.log(`\n${apply ? 'SUPPRESSION SOFT' : 'DRY-RUN'} — ${candidates.length} document(s) :\n`)
  console.log('─'.repeat(100))

  for (const { doc, reason } of candidates) {
    const aoTitle = (doc.tender as { title?: string } | null)?.title ?? '—'
    const sizeKb = ((doc.size ?? 0) / 1024).toFixed(1)
    console.log(
      `AO: ${aoTitle.slice(0, 50)} | ${doc.filename} | ${sizeKb} Ko | ${doc.content_type ?? '—'} | ${reason}`,
    )
    console.log(`  tender_id=${doc.tender_id} doc_id=${doc.id}`)
  }

  console.log('─'.repeat(100))

  if (!apply) {
    console.log('\nDry-run terminé. Pour soft-delete : npx tsx scripts/clean-signature-documents.ts --apply')
    return
  }

  const now = new Date().toISOString()
  let updated = 0
  for (const { doc } of candidates) {
    const { error: upErr } = await db
      .from('tender_documents')
      .update({ deleted_at: now })
      .eq('id', doc.id)
      .is('deleted_at', null)

    if (upErr) {
      console.error(`Erreur soft-delete ${doc.id}:`, upErr.message)
      continue
    }
    updated++
  }

  console.log(`\n✓ ${updated} document(s) marqué(s) deleted_at=${now}`)
  console.log('Les fichiers storage (devis) sont conservés ; seule la ligne DB est masquée.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
