'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type OperisContact,
  contactAvatarColor,
  contactInitials,
  formatContactAddress,
  parseEmailAddressList,
  sortContactsForAutocomplete,
} from '@/lib/contacts'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  contactsRef: React.RefObject<OperisContact[] | null>
  tenderId?: string | null
  suggestedTenderContacts?: OperisContact[]
  inputStyle: React.CSSProperties
}

function chipsFromValue(value: string): string[] {
  if (!value.trim()) return []
  return parseEmailAddressList(value).map(r =>
    r.name ? `${r.name} <${r.email}>` : r.email,
  )
}

function valueFromChips(chips: string[]): string {
  return chips.join(', ')
}

export default function ContactRecipientField({
  value,
  onChange,
  placeholder,
  contactsRef,
  tenderId,
  suggestedTenderContacts,
  inputStyle,
}: Props) {
  const [chips, setChips] = useState<string[]>(() => chipsFromValue(value))
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const next = chipsFromValue(value)
    if (valueFromChips(next) !== valueFromChips(chips)) {
      setChips(next)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const contacts = contactsRef.current ?? []

  const suggestions = useMemo(
    () => sortContactsForAutocomplete(contacts, inputValue, tenderId),
    [contacts, inputValue, tenderId],
  )

  const addChip = useCallback((formatted: string) => {
    const normalized = formatted.trim()
    if (!normalized) return
    const exists = chips.some(c => c.toLowerCase() === normalized.toLowerCase())
    const next = exists ? chips : [...chips, normalized]
    setChips(next)
    onChange(valueFromChips(next))
    setInputValue('')
    setOpen(false)
    setHighlight(0)
  }, [chips, onChange])

  const addContact = useCallback((c: OperisContact) => {
    addChip(formatContactAddress(c))
  }, [addChip])

  const removeChip = (index: number) => {
    const next = chips.filter((_, i) => i !== index)
    setChips(next)
    onChange(valueFromChips(next))
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && inputValue) setOpen(true)
      setHighlight(h => Math.min(h + 1, suggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && suggestions[highlight]) {
        addContact(suggestions[highlight])
        return
      }
      if (inputValue.trim()) {
        addChip(inputValue.trim())
      }
      return
    }
    if (e.key === 'Backspace' && !inputValue && chips.length) {
      removeChip(chips.length - 1)
    }
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const chipLabel = (chip: string) => {
    const match = chip.match(/^(.+)<([^>]+)>$/)
    if (match) return match[1].trim()
    return chip.split('@')[0]
  }

  const chipEmail = (chip: string) => {
    const match = chip.match(/<([^>]+)>/)
    return match ? match[1] : chip
  }

  const isFavoriteChip = (chip: string) => {
    const email = chipEmail(chip).toLowerCase()
    return contacts.find(c => c.email === email)?.is_favorite
  }

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          minHeight: 28, cursor: 'text',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(2,18,70,0.35)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6, padding: '2px 8px', fontSize: 12, color: '#e8eaef',
              maxWidth: '100%',
            }}
          >
            {isFavoriteChip(chip) && <span style={{ fontSize: 10 }}>⭐</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chipLabel(chip)}
            </span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeChip(i) }}
              style={{
                background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value)
            setOpen(e.target.value.length > 0 || suggestions.length > 0)
            setHighlight(0)
          }}
          onFocus={() => { if (inputValue || suggestions.length) setOpen(true) }}
          onKeyDown={onInputKeyDown}
          placeholder={chips.length ? '' : placeholder}
          style={{ ...inputStyle, minWidth: 80, flex: '1 1 80px' }}
        />
      </div>

      {suggestedTenderContacts && suggestedTenderContacts.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Contacts liés à cet AO :</span>
          {suggestedTenderContacts.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => addContact(c)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 12,
                border: '1px solid rgba(59,126,246,0.35)', background: 'rgba(59,126,246,0.12)',
                color: '#93c5fd', cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
              }}
            >
              {c.name?.split(' ')[0] ?? c.email.split('@')[0]}
            </button>
          ))}
        </div>
      )}

      {open && inputValue.length > 0 && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4,
            background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, zIndex: 20060, maxHeight: 280, overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}
        >
          {suggestions.map((c, i) => {
            const color = contactAvatarColor(c.email)
            const tenderBadge = tenderId && c.ao_ids?.includes(tenderId)
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => addContact(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 12px', border: 'none', cursor: 'pointer',
                  background: i === highlight ? 'rgba(2,18,70,0.55)' : 'transparent',
                  textAlign: 'left', fontFamily: 'DM Sans, system-ui',
                }}
              >
                <span
                  style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: color, color: '#fff', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {contactInitials(c.name, c.email)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>
                    {c.is_favorite && <span style={{ marginRight: 4 }}>⭐</span>}
                    {c.name ?? c.email}
                    {tenderBadge && (
                      <span style={{
                        marginLeft: 8, fontSize: 9, fontWeight: 600,
                        color: '#93c5fd', background: 'rgba(59,126,246,0.15)',
                        padding: '2px 6px', borderRadius: 4,
                      }}>
                        📋 Lié à cet AO
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {c.email}
                    {c.email_count > 0 && ` · ${c.email_count} mails échangés`}
                  </div>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
