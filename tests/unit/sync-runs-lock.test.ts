import { describe, expect, it, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isSyncRunInProgress,
  startSyncRun,
  finishSyncRun,
  SYNC_LOCK_MINUTES,
} from '@/lib/sync-runs'

type SyncRunsMockState = {
  runs: Array<{
    id: string
    started_at: string
    finished_at: string | null
    status: string
    accounts_synced: number
    new_emails: number
  }>
}

function createSyncRunsMock(initial: SyncRunsMockState = { runs: [] }) {
  const state = initial

  const db = {
    from: (table: string) => {
      if (table !== 'sync_runs') throw new Error(`unexpected table ${table}`)
      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
          is: (col: string, val: null) => ({
            gte: (_c: string, threshold: string) => ({
              is: async (_c2: string, _null: null) => {
                const count = state.runs.filter(
                  r => r.finished_at === val && r.started_at >= threshold,
                ).length
                return { count, error: null }
              },
              eq: async (_c2: string, _userId: string) => {
                const count = state.runs.filter(
                  r => r.finished_at === val && r.started_at >= threshold,
                ).length
                return { count, error: null }
              },
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: (_c: string) => ({
            single: async () => {
              const id = `run-${state.runs.length + 1}`
              state.runs.push({
                id,
                started_at: (row.started_at as string) ?? new Date().toISOString(),
                finished_at: null,
                status: (row.status as string) ?? 'success',
                accounts_synced: 0,
                new_emails: 0,
              })
              return { data: { id }, error: null }
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            const run = state.runs.find(r => r.id === id)
            if (run) {
              Object.assign(run, patch)
            }
            return { error: null }
          },
        }),
      }
    },
  } as unknown as SupabaseClient

  return { db, state }
}

describe('sync_runs verrou', () => {
  it('bloque un second run si un run est encore en cours', async () => {
    const { db } = createSyncRunsMock()
    const runId = await startSyncRun(db)
    expect(runId).toBeTruthy()

    const locked = await isSyncRunInProgress(db, SYNC_LOCK_MINUTES)
    expect(locked).toBe(true)
  })

  it('libère le verrou après finishSyncRun', async () => {
    const { db } = createSyncRunsMock()
    const startedAt = Date.now()
    const runId = await startSyncRun(db)
    expect(runId).toBeTruthy()

    await finishSyncRun(db, runId!, {
      status: 'success',
      accounts_synced: 1,
      new_emails: 0,
      startedAt,
    })

    const locked = await isSyncRunInProgress(db, SYNC_LOCK_MINUTES)
    expect(locked).toBe(false)
  })
})
