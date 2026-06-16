import { config as loadEnv } from 'dotenv'
import path from 'node:path'

const root = process.cwd()

// `.env.test` prime sur `.env.local` pour les credentials Supabase de test.
loadEnv({ path: path.resolve(root, '.env.test'), override: true })
loadEnv({ path: path.resolve(root, '.env.local'), override: false })

/** Ref projet Supabase prod — les tests d'intégration refusent cette URL (voir supabase-test.ts). */
export const PROD_SUPABASE_PROJECT_REF = 'lixlqcarbucmczjbgbhp'
