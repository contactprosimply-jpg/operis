#!/usr/bin/env node
/**
 * Upload les .exe de public/downloads/ vers Supabase Storage (bucket desktop-releases),
 * puis annonce la nouvelle version en direct (Realtime) — les postes déjà en 0.1.3+
 * relancent leur check immédiatement au lieu d'attendre le prochain cycle de polling.
 * Requiert SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL dans .env.local
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import pkg from '../package.json' with { type: 'json' }

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

const files = fs.readdirSync(downloadsDir).filter(f => f.endsWith('.exe') || f.endsWith('.blockmap') || f === 'latest.yml')
if (!files.length) {
  console.error('Aucun .exe/.yml/.blockmap dans public/downloads/')
  process.exit(1)
}

// latest.yml en dernier : sinon un client qui checke une mise à jour pendant l'upload
// pourrait le voir avant que le .exe correspondant ne soit disponible.
files.sort((a, b) => (a === 'latest.yml' ? 1 : 0) - (b === 'latest.yml' ? 1 : 0))

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

for (const name of files) {
  const buffer = fs.readFileSync(path.join(downloadsDir, name))
  console.log(`→ Upload ${name} (${(buffer.length / (1024 * 1024)).toFixed(1)} Mo)…`)
  const { error } = await db.storage.from('desktop-releases').upload(name, buffer, {
    contentType: name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
    upsert: true,
  })
  if (error) {
    console.error(`Erreur ${name}:`, error.message)
    process.exit(1)
  }
  console.log(`✓ ${name}`)
}

console.log('\nUpload terminé. Les liens /api/desktop/download et la mise à jour automatique fonctionneront en production.')

console.log(`→ Annonce en direct de la version ${pkg.version} (Realtime)…`)
await new Promise((resolve) => {
  const channel = db.channel('desktop-updates')
  const timeout = setTimeout(() => {
    console.error('✗ Annonce realtime : timeout (les postes se mettront à jour au prochain check de secours)')
    resolve()
  }, 8000)
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.send({ type: 'broadcast', event: 'new-version', payload: { version: pkg.version } })
      clearTimeout(timeout)
      console.log('✓ Version annoncée')
      await db.removeChannel(channel)
      resolve()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      clearTimeout(timeout)
      console.error(`✗ Annonce realtime échouée (${status}) — les postes se mettront à jour au prochain check de secours`)
      resolve()
    }
  })
})

process.exit(0) // le socket realtime peut laisser le process ouvert sinon
