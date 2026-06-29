'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-client'
import { Spinner, useToast } from '@/components/ui'
import {
  type OperisContact,
  contactAvatarColor,
  contactInitials,
  contactTimeAgo,
} from '@/lib/contacts'

function ContactRow({
  contact,
  onToggleFavorite,
  toggling,
}: {
  contact: OperisContact
  onToggleFavorite: (email: string, next: boolean) => void
  toggling: string | null
}) {
  const router = useRouter()
  const color = contactAvatarColor(contact.email)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color, color: '#fff', fontWeight: 700, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {contactInitials(contact.name, contact.email)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {contact.name ?? contact.email}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{contact.email}</div>
        {contact.company && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{contact.company}</div>
        )}
        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginTop: 6 }}>
          {contact.email_count} mail{contact.email_count > 1 ? 's' : ''} échangé{contact.email_count > 1 ? 's' : ''}
          {' · '}
          Dernier : {contactTimeAgo(contact.last_contacted_at)}
        </div>
        {contact.ao_ids?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {contact.ao_ids.slice(0, 5).map(tid => (
              <button
                key={tid}
                type="button"
                onClick={() => router.push(`/tenders/${tid}`)}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 6,
                  border: '1px solid rgba(2,18,70,0.25)', background: 'rgba(2,18,70,0.06)',
                  color: '#021246', cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                }}
              >
                AO
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={toggling === contact.email}
        title={contact.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        onClick={() => onToggleFavorite(contact.email, !contact.is_favorite)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 22,
          color: contact.is_favorite ? '#fbbf24' : 'var(--text-muted)',
          opacity: toggling === contact.email ? 0.5 : 1,
        }}
      >
        {contact.is_favorite ? '★' : '☆'}
      </button>
    </div>
  )
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<OperisContact[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { show, ToastComponent } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/contacts')
      const data = await res.json()
      if (data.success) setContacts(data.data ?? [])
      else show(`Erreur : ${data.error}`)
    } catch {
      show('Erreur chargement contacts')
    }
    setLoading(false)
  }, [show])

  useEffect(() => { void load() }, [load])

  const toggleFavorite = async (email: string, next: boolean) => {
    setToggling(email)
    const prev = contacts.find(c => c.email === email)?.is_favorite ?? false
    setContacts(list => list.map(c => c.email === email ? { ...c, is_favorite: next } : c))
    try {
      const res = await authFetch('/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({ email, is_favorite: next }),
      })
      const data = await res.json()
      if (!data.success) {
        setContacts(list => list.map(c => c.email === email ? { ...c, is_favorite: prev } : c))
        show(`Erreur : ${data.error}`)
      }
    } catch {
      setContacts(list => list.map(c => c.email === email ? { ...c, is_favorite: prev } : c))
      show('Erreur favori')
    }
    setToggling(null)
  }

  const q = search.trim().toLowerCase()
  const filtered = contacts.filter(c =>
    !q
    || c.email.toLowerCase().includes(q)
    || (c.name?.toLowerCase().includes(q))
    || (c.company?.toLowerCase().includes(q)),
  )
  const favorites = filtered.filter(c => c.is_favorite)
  const others = filtered.filter(c => !c.is_favorite)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div>
      {ToastComponent}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
            Contacts
          </span>
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            ({contacts.length})
          </span>
        </div>
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', fontSize: 13, minWidth: 220,
            fontFamily: 'DM Sans, system-ui', color: 'var(--text-primary)',
          }}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#021246', marginBottom: 10 }}>⭐ Favoris ({favorites.length})</div>
        {favorites.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Aucun favori — cliquez ☆ sur un mail reçu</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {favorites.map(c => (
              <ContactRow key={c.id} contact={c} onToggleFavorite={toggleFavorite} toggling={toggling} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
          👥 Tous les contacts ({others.length})
        </div>
        {others.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun contact</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {others.map(c => (
              <ContactRow key={c.id} contact={c} onToggleFavorite={toggleFavorite} toggling={toggling} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
