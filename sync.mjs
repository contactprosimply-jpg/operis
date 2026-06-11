// ============================================================
// OPERIS — sync.mjs
// Délègue au sync multi-dossiers (inbox, sent, drafts, trash, spam).
// Équivalent : npm run sync
// ============================================================

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const script = join(root, 'scripts', 'sync-mail.ts')

console.log('sync.mjs → scripts/sync-mail.ts (listBoxes + multi-dossiers)\n')

const result = spawnSync('npx', ['tsx', script], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
  cwd: root,
})

process.exit(result.status === null ? 1 : result.status)
