import { config as loadEnv } from 'dotenv'
import path from 'node:path'

const root = process.cwd()

// `.env.test` prime sur `.env.local` pour les credentials Supabase de test.
loadEnv({ path: path.resolve(root, '.env.test'), override: true })
loadEnv({ path: path.resolve(root, '.env.local'), override: false })

/** Refs Supabase bloqués pour les tests d'intégration : prod actuel + ancien projet prod (voir supabase-test.ts). */
export const BLOCKED_SUPABASE_PROJECT_REFS = ['tbrxojcsahthzeowbzdi', 'lixlqcarbucmczjbgbhp']
