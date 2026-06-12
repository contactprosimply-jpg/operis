'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import {
  AO_KEYWORD_CATEGORY_LABELS,
  type AoKeyword,
  type AoKeywordCategory,
} from '@/lib/ao-keywords'

const CATEGORIES: AoKeywordCategory[] = [
  'detection', 'question', 'reponse', 'relance', 'refus', 'acceptation',
]

const THRESHOLD_OPTIONS = [3, 4, 5, 6, 7, 8, 10]

export default function AoDetectionSection({
  onSaved,
  onError,
}: {
  onSaved: () => void
  onError?: (msg: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [keywords, setKeywords] = useState<AoKeyword[]>([])
  const [filterCat, setFilterCat] = useState<AoKeywordCategory | 'all'>('all')
  const [newKeyword, setNewKeyword] = useState('')
  const [newCategory, setNewCategory] = useState<AoKeywordCategory>('detection')
  const [newWeight, setNewWeight] = useState(3)
  const [adding, setAdding] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(5)
  const [savingThreshold, setSavingThreshold] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [kwRes, settingsRes] = await Promise.all([
        authFetch('/api/ao-keywords'),
        authFetch('/api/user-settings'),
      ])
      const kwData = await kwRes.json()
      const settingsData = await settingsRes.json()
      if (kwData.success) setKeywords(kwData.data as AoKeyword[])
      if (settingsData.success) {
        setThreshold(settingsData.data.ao_detection_threshold ?? 5)
      }
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : 'Erreur chargement')
    }
    setLoading(false)
  }, [onError])

  useEffect(() => { void load() }, [load])

  const filtered = filterCat === 'all'
    ? keywords
    : keywords.filter(k => k.category === filterCat)

  const addKeyword = async () => {
    const kw = newKeyword.trim().toLowerCase()
    if (!kw) return
    setAdding(true)
    const prev = [...keywords]
    const optimistic: AoKeyword = {
      id: `tmp-${Date.now()}`,
      keyword: kw,
      category: newCategory,
      weight: newWeight,
    }
    setKeywords(prev => [...prev, optimistic])
    setNewKeyword('')
    try {
      const res = await authFetch('/api/ao-keywords', {
        method: 'POST',
        body: JSON.stringify({ keyword: kw, category: newCategory, weight: newWeight }),
      })
      const data = await res.json()
      if (data.success) {
        setKeywords(list => list.map(k => k.id === optimistic.id ? data.data : k))
        onSaved()
      } else {
        setKeywords(prev)
        onError?.(data.error ?? 'Erreur ajout')
      }
    } catch (e: unknown) {
      setKeywords(prev)
      onError?.(e instanceof Error ? e.message : 'Erreur réseau')
    }
    setAdding(false)
  }

  const deleteKeyword = async (id: string) => {
    if (id.startsWith('tmp-') || id.startsWith('default-')) return
    setDeletingId(id)
    const prev = keywords
    setKeywords(list => list.filter(k => k.id !== id))
    try {
      const res = await authFetch(`/api/ao-keywords?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) {
        setKeywords(prev)
        onError?.(data.error ?? 'Erreur suppression')
      } else {
        onSaved()
      }
    } catch (e: unknown) {
      setKeywords(prev)
      onError?.(e instanceof Error ? e.message : 'Erreur réseau')
    }
    setDeletingId(null)
  }

  const restoreDefaults = async () => {
    setRestoring(true)
    try {
      const res = await authFetch('/api/ao-keywords', {
        method: 'POST',
        body: JSON.stringify({ action: 'restore_defaults' }),
      })
      const data = await res.json()
      if (data.success) {
        setKeywords(data.data as AoKeyword[])
        onSaved()
      } else {
        onError?.(data.error ?? 'Erreur restauration')
      }
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : 'Erreur réseau')
    }
    setRestoring(false)
  }

  const saveThreshold = async (value: number) => {
    const prev = threshold
    setThreshold(value)
    setSavingThreshold(true)
    try {
      const res = await authFetch('/api/user-settings', {
        method: 'PATCH',
        body: JSON.stringify({ ao_detection_threshold: value }),
      })
      const data = await res.json()
      if (data.success) {
        onSaved()
      } else {
        setThreshold(prev)
        onError?.(data.error ?? 'Erreur seuil')
      }
    } catch (e: unknown) {
      setThreshold(prev)
      onError?.(e instanceof Error ? e.message : 'Erreur réseau')
    }
    setSavingThreshold(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner size={24} />
      </div>
    )
  }

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '20px 22px', marginBottom: 16,
  }

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#021246', marginBottom: 12 }}>
          Seuil de détection AO
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Score minimum (somme des poids des mots clés) pour marquer un mail comme lié à un AO. Défaut : 5.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {THRESHOLD_OPTIONS.map(v => {
            const active = v === threshold
            return (
              <button
                key={v}
                type="button"
                disabled={savingThreshold}
                onClick={() => void saveThreshold(v)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                  border: active ? '1px solid #3B7FE8' : '1px solid var(--border)',
                  background: active ? '#3B7FE8' : 'var(--bg-secondary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {v}
              </button>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#021246' }}>
            Mots clés ({filtered.length})
          </div>
          <Button variant="ghost" loading={restoring} onClick={() => void restoreDefaults()}>
            Restaurer les mots clés par défaut
          </Button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
              border: filterCat === 'all' ? '1px solid #021246' : '1px solid var(--border)',
              background: filterCat === 'all' ? '#021246' : 'var(--bg-secondary)',
              color: filterCat === 'all' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            Tous
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCat(cat)}
              style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                border: filterCat === cat ? '1px solid #3B7FE8' : '1px solid var(--border)',
                background: filterCat === cat ? 'rgba(59,127,246,0.12)' : 'var(--bg-secondary)',
                color: filterCat === cat ? '#3B7FE8' : 'var(--text-secondary)',
              }}
            >
              {AO_KEYWORD_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16,
          padding: 12, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        }}>
          <input
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            placeholder="Nouveau mot clé…"
            style={{
              flex: '1 1 160px', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-card)',
            }}
          />
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value as AoKeywordCategory)}
            style={{
              padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
              fontSize: 12, background: 'var(--bg-card)',
            }}
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{AO_KEYWORD_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select
            value={newWeight}
            onChange={e => setNewWeight(Number(e.target.value))}
            style={{
              padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
              fontSize: 12, background: 'var(--bg-card)',
            }}
          >
            {[1, 2, 3, 4, 5].map(w => (
              <option key={w} value={w}>Poids {w}</option>
            ))}
          </select>
          <Button variant="primary" loading={adding} onClick={() => void addKeyword()}>
            Ajouter
          </Button>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Aucun mot clé dans cette catégorie
            </div>
          ) : filtered.map(kw => (
            <div
              key={kw.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderBottom: '1px solid var(--border)', fontSize: 12,
              }}
            >
              <span style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary)' }}>{kw.keyword}</span>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(2,18,70,0.08)', color: '#021246',
              }}>
                {AO_KEYWORD_CATEGORY_LABELS[kw.category]}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                ×{kw.weight}
              </span>
              <button
                type="button"
                disabled={deletingId === kw.id || kw.id.startsWith('default-')}
                onClick={() => void deleteKeyword(kw.id)}
                style={{
                  fontSize: 11, color: '#f87171', background: 'transparent',
                  border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6,
                  padding: '4px 10px', cursor: 'pointer',
                }}
              >
                {deletingId === kw.id ? '…' : 'Supprimer'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
