#!/usr/bin/env node
/**
 * Compile l'installateur Windows et le copie dans public/downloads/
 * Usage: node scripts/build-desktop-release.mjs
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pkg from '../package.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'dist-desktop')
const publicDir = path.join(root, 'public', 'downloads')

/** Retourne le nom de fichier (basename), pas le chemin complet. dist-desktop/ peut
 *  contenir des builds précédents d'une autre version — on exige un match exact sur
 *  la version courante de package.json pour ne jamais publier un artefact périmé. */
function findArtifactName(predicate) {
  if (!fs.existsSync(outDir)) return null
  return fs.readdirSync(outDir).find(predicate) ?? null
}

console.log('→ Génération icône + build Electron (peut prendre plusieurs minutes)…')
execSync('npm run desktop:build', { cwd: root, stdio: 'inherit' })

const v = pkg.version
const setup = findArtifactName(f => f === `Operis-Setup-${v}.exe`)
const portable = findArtifactName(f => f === `Operis-Portable-${v}.exe`)
const blockmap = findArtifactName(f => f === `Operis-Setup-${v}.exe.blockmap`)
const latestYml = findArtifactName(f => f === 'latest.yml')

if (!setup) {
  console.error('Build terminé mais Operis-Setup-*.exe introuvable dans dist-desktop/')
  process.exit(1)
}
if (!latestYml || !blockmap) {
  console.error('latest.yml ou le .blockmap est introuvable — la mise à jour automatique ne fonctionnera pas. Vérifiez la config "publish" dans package.json.')
}

fs.mkdirSync(publicDir, { recursive: true })

for (const artifact of [setup, portable, blockmap, latestYml].filter(Boolean)) {
  fs.copyFileSync(path.join(outDir, artifact), path.join(publicDir, artifact))
  console.log(`✓ Copié: public/downloads/${artifact}`)
}

const setupMb = (fs.statSync(path.join(publicDir, setup)).size / (1024 * 1024)).toFixed(1)
console.log(`\nInstallateur prêt (${setupMb} Mo)`)
console.log(`URL locale: /downloads/${setup}`)
console.log('Lancez ensuite: npm run desktop:upload')
