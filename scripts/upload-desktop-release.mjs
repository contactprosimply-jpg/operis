#!/usr/bin/env node
/**
 * Upload les .exe de public/downloads/ vers Supabase Storage (bucket desktop-releases).
 * Requiert SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL dans .env.local
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local')
  process.exit(1)
}

const downloadsDir = path.join(root, 'public', 'downloads')
if (!fs.existsSync(downloadsDir)) {
  console.error('Dossier public/downloads/ absent — lancez: node scripts/build-desktop-release.mjs')
  process.exit(1)
}

const files = fs.readdirSync(downloadsDir).filter(f => f.endsWith('.exe'))
if (!files.length) {
  console.error('Aucun .exe dans public/downloads/')
  process.exit(1)
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

for (const name of files) {
  const buffer = fs.readFileSync(path.join(downloadsDir, name))
  console.log(`→ Upload ${name} (${(buffer.length / (1024 * 1024)).toFixed(1)} Mo)…`)
  const { error } = await db.storage.from('desktop-releases').upload(name, buffer, {
    contentType: 'application/octet-stream',
    upsert: true,
  })
  if (error) {
    console.error(`Erreur ${name}:`, error.message)
    process.exit(1)
  }
  console.log(`✓ ${name}`)
}

console.log('\nUpload terminé. Les liens /api/desktop/download fonctionneront en production.')
