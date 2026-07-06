#!/usr/bin/env node
/**
 * Compile l'installateur Windows et le copie dans public/downloads/
 * Usage: node scripts/build-desktop-release.mjs
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'dist-desktop')
const publicDir = path.join(root, 'public', 'downloads')

function findArtifact(prefix) {
  if (!fs.existsSync(outDir)) return null
  const files = fs.readdirSync(outDir).filter(f => f.startsWith(prefix) && f.endsWith('.exe'))
  return files[0] ? path.join(outDir, files[0]) : null
}

console.log('→ Génération icône + build Electron (peut prendre plusieurs minutes)…')
execSync('npm run desktop:build', { cwd: root, stdio: 'inherit' })

const setup = findArtifact('Operis-Setup-')
const portable = findArtifact('Operis-Portable-')

if (!setup) {
  console.error('Build terminé mais Operis-Setup-*.exe introuvable dans dist-desktop/')
  process.exit(1)
}

fs.mkdirSync(publicDir, { recursive: true })

const setupDest = path.join(publicDir, path.basename(setup))
fs.copyFileSync(setup, setupDest)
console.log(`✓ Copié: public/downloads/${path.basename(setup)}`)

if (portable) {
  const portableDest = path.join(publicDir, path.basename(portable))
  fs.copyFileSync(portable, portableDest)
  console.log(`✓ Copié: public/downloads/${path.basename(portable)}`)
}

const setupMb = (fs.statSync(setupDest).size / (1024 * 1024)).toFixed(1)
console.log(`\nInstallateur prêt (${setupMb} Mo)`)
console.log(`URL locale: /downloads/${path.basename(setup)}`)
console.log('Déployez sur Vercel puis testez /telechargement')
