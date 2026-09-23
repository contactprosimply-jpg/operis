'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCorpsEtats, useSuppliers } from '@/hooks'
import { effectiveMailLanguageLabel, SUPPLIER_LANGUAGES } from '@/lib/supplier-languages'
import type { Supplier } from '@/types/database'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const router = useRouter()
  const { suppliers, create, update } = useSuppliers()
  const { corpsEtats } = useCorpsEtats()

  const [name, setName] = useState(supplier?.name ?? '')
  const [contactName, setContactName] = useState(supplier?.contact_name ?? '')
  const [corps, setCorps] = useState<string[]>(supplier?.corps_etats ?? [])
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [extraEmails, setExtraEmails] = useState<string[]>(supplier?.additional_emails ?? [])
  const [language, setLanguage] = useState(supplier?.language?.trim() || 'Français')
  const [country, setCountry] = useState(supplier?.country ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const back = () => router.push(supplier ? `/suppliers?id=${supplier.id}` : '/suppliers')

  const emailOk = EMAIL_RE.test(email.trim())
  const extraOk = extraEmails.every(e => !e.trim() || EMAIL_RE.test(e.trim()))
  const nameOk = name.trim().length > 0
  const duplicate = emailOk
    ? suppliers.find(s => s.id !== supplier?.id && s.email.trim().toLowerCase() === email.trim().toLowerCase())
    : undefined

  const languageOptions: string[] = [...SUPPLIER_LANGUAGES]
  if (language && !languageOptions.includes(language)) languageOptions.push(language)

  const selectedLabels = [...corpsEtats]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter(c => corps.includes(c.id))
    .map(c => c.label)
  const familyText = selectedLabels.length === 0 ? '' : selectedLabels.length === 1
    ? selectedLabels[0]
    : `${selectedLabels.slice(0, -1).join(', ')} et ${selectedLabels[selectedLabels.length - 1]}`

  const toggle = (id: string) => setCorps(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  const save = async () => {
    setSubmitted(true)
    setServerError(null)
    if (!nameOk || !emailOk || !extraOk) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      contact_name: contactName.trim() || null,
      email: email.trim(),
      additional_emails: extraEmails.map(e => e.trim()).filter(Boolean),
      phone: phone.trim(),
      language,
      country: country.trim(),
      notes: notes.trim(),
      corps_etats: corps,
    }
    const res = supplier ? await update(supplier.id, payload) : await create(payload)
    setSaving(false)
    if (!res.success) { setServerError(res.error); return }
    router.push(`/suppliers?id=${res.data.id}`)
  }

  return (
    <div className="sp-form-page">
      <div className="sp-form-head">
        <div>
          <button type="button" className="sp-form-back" onClick={back}>← Fournisseurs</button>
          <h1 className="sp-title" style={{ marginTop: 4 }}>{supplier ? `Modifier ${supplier.name}` : 'Nouveau fournisseur'}</h1>
        </div>
        <div className="sp-actions">
          <button type="button" className="sp-btn" onClick={back}>Annuler</button>
          <button type="button" className="sp-btn sp-btn--primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>

      {serverError && <div className="sp-warn" style={{ marginBottom: 16 }}>{serverError}</div>}

      <div className="sp-form-grid">
        <div className="sp-form-col">
          <section className="sp-card">
            <div className="sp-label">1 · Identité</div>
            <label className="sp-field">
              <span className="sp-label">Nom de l’entreprise *</span>
              <input className={`sp-input${submitted && !nameOk ? ' sp-input--error' : ''}`} value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Martin Électricité" />
              {submitted && !nameOk && <span className="sp-error">Le nom de l’entreprise est obligatoire.</span>}
            </label>
            <label className="sp-field">
              <span className="sp-label">Nom du contact</span>
              <input className="sp-input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Facultatif" />
            </label>
          </section>

          <section className="sp-card">
            <div className="sp-block-head">
              <div className="sp-label">2 · Corps d’état</div>
              <span className="sp-label">{corps.length} sélectionné{corps.length > 1 ? 's' : ''}</span>
            </div>
            <p className="sp-hint" style={{ margin: '8px 0 0' }}>
              Choisissez tous les corps d’état que ce fournisseur couvre. Il sera proposé en priorité sur les AO de ces lots.
            </p>
            <div className="sp-choices">
              {corpsEtats.map(c => (
                <button
                  key={c.id} type="button" aria-pressed={corps.includes(c.id)} onClick={() => toggle(c.id)}
                  className={`sp-choice${c.id === 'autre' ? ' sp-choice--other' : ''}`}
                >{c.label}</button>
              ))}
            </div>
          </section>

          <section className="sp-card">
            <div className="sp-label">3 · Coordonnées</div>
            <label className="sp-field">
              <span className="sp-label">E-mail principal *</span>
              <input
                className={`sp-input${submitted && !emailOk ? ' sp-input--error' : ''}`} type="email" inputMode="email" autoCapitalize="none"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@fournisseur.fr"
              />
              <span className="sp-hint">Reçoit les consultations.</span>
              {submitted && !emailOk && <span className="sp-error">Saisissez une adresse e-mail valide.</span>}
              {duplicate && <span className="sp-warn">Un fournisseur a déjà cet e-mail : {duplicate.name}. Vous pouvez enregistrer quand même.</span>}
            </label>
            <label className="sp-field">
              <span className="sp-label">Téléphone</span>
              <input className="sp-input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
            </label>
            {extraEmails.map((value, i) => (
              <div key={i} className="sp-field">
                <span className="sp-label">E-mail secondaire {i + 1}</span>
                <div className="sp-row">
                  <input
                    className={`sp-input${submitted && value.trim() && !EMAIL_RE.test(value.trim()) ? ' sp-input--error' : ''}`}
                    type="email" inputMode="email" autoCapitalize="none" value={value}
                    onChange={e => setExtraEmails(list => list.map((v, j) => j === i ? e.target.value : v))}
                  />
                  <button type="button" className="sp-btn" aria-label="Retirer cet e-mail" onClick={() => setExtraEmails(list => list.filter((_, j) => j !== i))}>×</button>
                </div>
              </div>
            ))}
            {submitted && !extraOk && <span className="sp-error">Un e-mail secondaire n’est pas valide.</span>}
            <button type="button" className="sp-linkbtn" onClick={() => setExtraEmails(list => [...list, ''])}>+ Ajouter un e-mail secondaire</button>
          </section>
        </div>

        <div className="sp-form-col">
          <section className="sp-card">
            <div className="sp-label">4 · Consultations</div>
            <label className="sp-field">
              <span className="sp-label">Langue des e-mails</span>
              <select className="sp-input" value={language} onChange={e => setLanguage(e.target.value)}>
                {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="sp-hint">Consultations et relances partent en {effectiveMailLanguageLabel(language)} tant que vous ne modifiez pas le message.</span>
            </label>
            <label className="sp-field">
              <span className="sp-label">Pays</span>
              <input className="sp-input" value={country} onChange={e => setCountry(e.target.value)} placeholder="Facultatif" />
            </label>
            <label className="sp-field">
              <span className="sp-label">Notes</span>
              <textarea className="sp-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations…" />
            </label>
          </section>

          <section className="sp-preview" aria-label="Aperçu">
            <div className="sp-label">Aperçu</div>
            <div className="sp-preview-name">{name.trim() || 'Nom du fournisseur'}</div>
            <div className="sp-pills">
              {selectedLabels.length === 0
                ? <span className="sp-pill">À classer</span>
                : selectedLabels.map(l => <span key={l} className="sp-pill">{l}</span>)}
            </div>
            <p>
              {selectedLabels.length === 0
                ? 'Il sera rangé dans « À classer » : cochez un corps d’état pour qu’il soit proposé sur les AO de ces lots.'
                : `Il sera rangé dans ${selectedLabels.length > 1 ? 'les familles' : 'la famille'} ${familyText} et proposé automatiquement sur les AO de ces lots.`}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
