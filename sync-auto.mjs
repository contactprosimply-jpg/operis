import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INTERVAL = 2 * 60 * 60 * 1000 // 2 heures en ms

console.log('🔄 Operis Auto-Sync démarré')
console.log(`Synchronisation toutes les 2 heures`)
console.log(`Prochaine sync : ${new Date(Date.now() + INTERVAL).toLocaleTimeString('fr-FR')}`)
console.log('─'.repeat(40))

async function runSync() {
  return new Promise((resolve) => {
    console.log(`\n[${new Date().toLocaleString('fr-FR')}] Synchronisation en cours...`)
    
    const child = spawn('node', ['sync.mjs'], {
      cwd: __dirname,
      stdio: 'inherit'
    })

    child.on('close', (code) => {
      console.log(`[${new Date().toLocaleString('fr-FR')}] Sync terminée`)
      console.log(`Prochaine sync : ${new Date(Date.now() + INTERVAL).toLocaleTimeString('fr-FR')}`)
      resolve(code)
    })
  })
}

// Lancer immédiatement au démarrage
await runSync()

// Puis toutes les 2 heures
setInterval(runSync, INTERVAL)