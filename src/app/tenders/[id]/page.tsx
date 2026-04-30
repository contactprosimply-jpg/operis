'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenderDetail, useSuppliers } from '@/hooks'
import { Button, Modal, TenderStatusBadge, ConsultationStatusBadge, KpiCard, ProgressBar, Spinner, useToast, Field } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ConsultationWithSupplier } from '@/types/database'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}
const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers ?? {}) } })
}
const getSignature = () => {
  try {
    const mode = localStorage.getItem('operis_signature_mode') ?? 'fields'
    const sig = JSON.parse(localStorage.getItem('operis_signature') ?? '{}')
    if (mode === 'html') return sig.html ? `\n\n--\n${sig.html}` : ''
    if (!sig.name) return ''
    return `\n\n--\n${sig.name}${sig.title ? ` | ${sig.title}` : ''}${sig.company ? ` | ${sig.company}` : ''}${sig.phone ? `\n${sig.phone}` : ''}${sig.email ? ` | ${sig.email}` : ''}`
  } catch { return '' }
}

function Composer({ title, onClose, children, subject, body, onSubjectChange, onBodyChange, onSend, sending, sendLabel }: any) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 14, width: 640, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {children}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Objet</div>
            <input value={subject} onChange={e => onSubjectChange(e.target.value)} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Message</div>
            <textarea value={body} onChange={e => onBodyChange(e.target.value)} rows={10} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', outline: 'none', resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" loading={sending} onClick={onSend}>{sendLabel}</Button>
        </div>
      </div>
    </div>
  )
}

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { tender, loading, addSupplier, relaunchAll, markStatus, refetch } = useTenderDetail(id)
  const { suppliers } = useSuppliers()
  const { show, ToastComponent } = useToast()

  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Relaunch history
  const [showRelaunchHistory, setShowRelaunchHistory] = useState(false)
  const [relaunchHistory, setRelaunchHistory] = useState<any[]>([])

  // Consultation composer
  const [showComposer, setShowComposer] = useState(false)
  const [selectedConsultSuppliers, setSelectedConsultSuppliers] = useState<string[]>([])
  const [composerSubject, setComposerSubject] = useState('')
  const [composerBody, setComposerBody] = useState('')
  const [sendingConsult, setSendingConsult] = useState(false)

  // Relaunch composer
  const [showRelaunchComposer, setShowRelaunchComposer] = useState(false)
  const [relaunchTarget, setRelaunchTarget] = useState<ConsultationWithSupplier | null>(null)
  const [relaunchSubject, setRelaunchSubject] = useState('')
  const [relaunchBody, setRelaunchBody] = useState('')
  const [sendingRelaunch, setSendingRelaunch] = useState(false)

  // Quote
  const [showAddQuote, setShowAddQuote] = useState(false)
  const [quoteSupplier, setQuoteSupplier] = useState('')
  const [quotePriceHT, setQuotePriceHT] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)

  // Quote validation popup
  const [showValidateQuote, setShowValidateQuote] = useState(false)
  const [validateQuoteId, setValidateQuoteId] = useState('')
  const [validateQuoteSupplier, setValidateQuoteSupplier] = useState<any>(null)
  const [validateSubject, setValidateSubject] = useState('')
  const [validateBody, setValidateBody] = useState('')
  const [validateRecipients, setValidateRecipients] = useState<string[]>([])
  const [validating, setValidating] = useState(false)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>
  if (!tender) return <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 80 }}>AO introuvable</div>

  const stats = tender.stats
  const respPct = stats?.nb_suppliers > 0 ? Math.round((stats.nb_responses / stats.nb_suppliers) * 100) : 0
  const delayPct = tender.deadline ? Math.min(100, Math.round(((new Date().getTime() - new Date(tender.created_at).getTime()) / (new Date(tender.deadline).getTime() - new Date(tender.created_at).getTime())) * 100)) : 0
  const addedIds = tender.consultations.map((c: any) => c.supplier_id)
  const availableSuppliers = suppliers.filter((s: any) => !addedIds.includes(s.id))

  const isWon = tender.status === 'gagne'
  const isLost = tender.status === 'perdu'

  const action = async (key: string, fn: () => Promise<any>, msg: string) => {
    setLoadingAction(key)
    const res = await fn()
    setLoadingAction(null)
    if (res?.success) show(msg)
    else show(`Erreur : ${res?.error}`)
  }

  const openConsultComposer = () => {
    const targets = tender.consultations.filter((c: any) => c.status === 'en_attente')
    const list = targets.length > 0 ? targets : tender.consultations
    setSelectedConsultSuppliers(list.map((c: any) => c.supplier_id))
    const sig = getSignature()
    setComposerSubject(`Consultation — ${tender.title}`)
    setComposerBody(`Bonjour,\n\nNous vous contactons dans le cadre d'un appel d'offres pour le projet suivant :\n\nProjet : ${tender.title}\nClient : ${tender.client}${tender.deadline ? `\nDate limite : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}` : ''}\n\nMerci de nous faire parvenir votre offre dans les meilleurs delais.${sig}`)
    setShowComposer(true)
  }

  const sendConsultation = async () => {
    if (selectedConsultSuppliers.length === 0) { show('Selectionne au moins un fournisseur'); return }
    setSendingConsult(true)
    let sent = 0, errors = 0
    for (const supplierId of selectedConsultSuppliers) {
      const c = tender.consultations.find((c: any) => c.supplier_id === supplierId)
      if (!c) continue
      try {
        const mailRes = await authFetch('/api/mail/send', { method: 'POST', body: JSON.stringify({ to: c.supplier.email, subject: composerSubject, body: composerBody }) })
        const mailData = await mailRes.json()
        if (mailData.success) {
          await authFetch(`/api/tenders/${id}/consult`, { method: 'POST', body: JSON.stringify({ supplier_ids: [supplierId] }) })
          sent++
        } else errors++
      } catch { errors++ }
    }
    setSendingConsult(false)
    setShowComposer(false)
    await refetch()
    show(`${sent} consultation(s) envoyee(s)${errors > 0 ? ` — ${errors} erreur(s)` : ''}`)
  }

  const openRelaunchComposer = (consultation: ConsultationWithSupplier) => {
    setRelaunchTarget(consultation)
    const n = (consultation.relaunch_count ?? 0) + 1
    const sig = getSignature()
    setRelaunchSubject(`Relance${n > 1 ? ` ${n}` : ''} — ${tender.title}`)
    setRelaunchBody(`Bonjour,\n\nSauf erreur de notre part, nous n'avons pas encore recu votre devis concernant :\n\nProjet : ${tender.title}\nClient : ${tender.client}${tender.deadline ? `\nDate limite : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}` : ''}\n\nPourriez-vous nous faire parvenir votre offre dans les meilleurs delais ?${sig}`)
    setShowRelaunchComposer(true)
  }

  const sendRelaunch = async () => {
    if (!relaunchTarget) return
    setSendingRelaunch(true)
    try {
      const mailRes = await authFetch('/api/mail/send', { method: 'POST', body: JSON.stringify({ to: relaunchTarget.supplier.email, subject: relaunchSubject, body: relaunchBody }) })
      const mailData = await mailRes.json()
      if (mailData.success) {
        await authFetch(`/api/tenders/${id}/relaunch`, { method: 'POST', body: JSON.stringify({ supplier_id: relaunchTarget.supplier_id }) })
        // Save relaunch history
        const token = await getToken()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await supabase.from('relaunch_history').insert({
            tender_id: id, supplier_id: relaunchTarget.supplier_id,
            user_id: session.user.id, subject: relaunchSubject, body: relaunchBody,
            relaunch_number: (relaunchTarget.relaunch_count ?? 0) + 1
          })
        }
        setShowRelaunchComposer(false)
        await refetch()
        show(`Relance envoyee a ${relaunchTarget.supplier.name}`)
      } else show(`Erreur : ${mailData.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSendingRelaunch(false)
  }

  const loadRelaunchHistory = async () => {
    const { data } = await supabase.from('relaunch_history').select('*, supplier:suppliers(name)').eq('tender_id', id).order('sent_at', { ascending: false })
    setRelaunchHistory(data ?? [])
    setShowRelaunchHistory(true)
  }

  const saveQuote = async () => {
    if (!quoteSupplier) { show('Selectionne un fournisseur'); return }
    setSavingQuote(true)
    try {
      const res = await authFetch('/api/quotes', { method: 'POST', body: JSON.stringify({ tender_id: id, supplier_id: quoteSupplier, price_ht: quotePriceHT ? parseFloat(quotePriceHT.replace(',', '.')) : null, notes: quoteNotes || null }) })
      const data = await res.json()
      if (data.success) { setShowAddQuote(false); setQuoteSupplier(''); setQuotePriceHT(''); setQuoteNotes(''); await refetch(); show('Devis enregistre') }
      else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSavingQuote(false)
  }

  const openValidateQuote = (quote: any) => {
    setValidateQuoteId(quote.id)
    setValidateQuoteSupplier(quote.supplier)
    const sig = getSignature()
    // Pre-select all suppliers for notification
    setValidateRecipients(tender.consultations.map((c: any) => c.supplier_id))
    setValidateSubject(`Attribution du marche — ${tender.title}`)
    setValidateBody(`Bonjour,\n\nNous avons le plaisir de vous informer que votre offre pour le projet suivant a ete retenue :\n\nProjet : ${tender.title}\nClient : ${tender.client}\nMontant HT retenu : ${quote.price_ht ? `${quote.price_ht.toLocaleString('fr-FR')} EUR` : 'A confirmer'}\n\nNous vous contacterons prochainement pour la suite des operations.\n\nCordialement,${sig}`)
    setShowValidateQuote(true)
  }

  const handleValidateQuote = async () => {
    setValidating(true)
    try {
      // Mark quote as validated
      const res = await authFetch(`/api/tenders/${id}/validate-quote`, { method: 'POST', body: JSON.stringify({ quote_id: validateQuoteId, supplier_ids_to_notify: validateRecipients }) })
      const data = await res.json()

      if (data.success) {
        // Send emails to selected recipients
        for (const supplierId of validateRecipients) {
          const c = tender.consultations.find((c: any) => c.supplier_id === supplierId)
          if (!c) continue
          const isWinner = supplierId === validateQuoteSupplier?.id || data.data.quote?.supplier_id === supplierId

          const subject = isWinner ? validateSubject : `Suite a votre offre — ${tender.title}`
          const body = isWinner ? validateBody : `Bonjour,\n\nNous vous remercions pour votre offre concernant le projet "${tender.title}".\n\nApres etude des differentes propositions, nous avons retenu une autre offre pour ce projet.\n\nNous esperous pouvoir collaborer avec vous sur de futurs projets.\n\nCordialement,${getSignature()}`

          await authFetch('/api/mail/send', { method: 'POST', body: JSON.stringify({ to: c.supplier.email, subject, body }) })
        }

        setShowValidateQuote(false)
        await refetch()
        show('Devis valide et emails envoyes')
      } else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setValidating(false)
  }

  // Status color
  const statusBg = isWon ? 'rgba(34,197,94,0.06)' : isLost ? 'rgba(239,68,68,0.06)' : 'transparent'
  const statusBorder = isWon ? 'rgba(34,197,94,0.2)' : isLost ? 'rgba(239,68,68,0.2)' : 'transparent'

  return (
    <div style={{ background: statusBg, border: isWon || isLost ? `1px solid ${statusBorder}` : 'none', borderRadius: isWon || isLost ? 12 : 0, padding: isWon || isLost ? 16 : 0, margin: isWon || isLost ? -4 : 0 }}>
      {ToastComponent}

      {/* Won/Lost banner */}
      {isWon && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 16px', background: 'rgba(34,197,94,0.1)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.3)' }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>AO gagne — Marche attribue</span>
        </div>
      )}
      {isLost && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
          <span style={{ fontSize: 20 }}>❌</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>AO perdu — Marche non attribue</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <button onClick={() => router.back()} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 8, display: 'block' }}>← Retour</button>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{tender.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>{tender.client}</span>
            {stats?.days_remaining !== null && <span style={{ color: stats.days_remaining <= 3 ? '#f87171' : 'var(--text-secondary)' }}>{stats.days_remaining}j restants</span>}
            <TenderStatusBadge status={tender.status} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!isWon && !isLost && <Button variant="primary" onClick={openConsultComposer}>Envoyer consultation</Button>}
          <Button variant="ghost" onClick={() => setShowAddQuote(true)}>+ Devis recu</Button>
          <button onClick={loadRelaunchHistory} style={{ padding: '6px 14px', border: '1px solid var(--border-hi)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
            Historique relances
          </button>
          {!isWon && <Button variant="success" loading={loadingAction === 'won'} onClick={() => action('won', () => markStatus('gagne'), 'AO marque Gagne')}>Gagne</Button>}
          {!isLost && <Button variant="danger" loading={loadingAction === 'lost'} onClick={() => action('lost', () => markStatus('perdu'), 'AO marque Perdu')}>Perdu</Button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <KpiCard label="Delai restant" value={stats?.days_remaining !== null ? `${stats.days_remaining}j` : '—'} />
            <KpiCard label="Fournisseurs" value={stats?.nb_suppliers ?? 0} />
            <KpiCard label="Reponses" value={stats?.nb_responses ?? 0} />
            <KpiCard label="Devis" value={stats?.nb_quotes ?? 0} />
          </div>

          {/* Fournisseurs */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Fournisseurs consultes</span>
              <Button variant="ghost" onClick={() => setShowAddSupplier(true)}>+ Ajouter</Button>
            </div>
            {tender.consultations.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Aucun fournisseur ajoute</div>
            ) : tender.consultations.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--accent)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>
                  {c.supplier.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.supplier.name}</div>
                  <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.supplier.email}</div>
                </div>
                <ConsultationStatusBadge status={c.status} />
                {!isWon && !isLost && <Button variant="ghost" onClick={() => openRelaunchComposer(c)}>Relancer</Button>}
                <Button variant="ghost" onClick={() => { setQuoteSupplier(c.supplier_id); setShowAddQuote(true) }}>+ Devis</Button>
              </div>
            ))}
          </div>

          {/* Devis recus */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Devis recus</span>
              <Button variant="ghost" onClick={() => setShowAddQuote(true)}>+ Ajouter</Button>
            </div>
            {tender.quotes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Aucun devis recu</div>
            ) : (
              <>
                {tender.quotes.map((q: any) => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', background: q.is_selected ? 'rgba(34,197,94,0.04)' : 'transparent', borderRadius: q.is_selected ? 8 : 0, paddingLeft: q.is_selected ? 10 : 0 }}>
                    {/* Info devis */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{q.supplier.name}</span>
                        {q.is_selected && <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', padding: '1px 6px', borderRadius: 5, fontFamily: 'DM Mono, monospace' }}>RETENU</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: q.is_selected ? '#4ade80' : '#4ade80', fontWeight: 600 }}>
                          {q.price_ht ? `${q.price_ht.toLocaleString('fr-FR')} EUR HT` : 'Prix non renseigne'}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                          {new Date(q.received_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      {q.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{q.notes}</div>}
                    </div>

                    {/* Actions droite — email + PJ + valider */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => router.push('/mail')} style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        Email
                      </button>
                      {(q.attachment_urls?.length > 0) && (
                        <button style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                          PJ ({q.attachment_urls.length})
                        </button>
                      )}
                      {!q.is_selected && !isWon && (
                        <button onClick={() => openValidateQuote(q)} style={{ fontSize: 11, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans, system-ui', fontWeight: 600 }}>
                          Valider ce devis
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Comparateur */}
                {tender.quotes.length > 1 && stats?.min_quote && stats?.max_quote && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', marginTop: 12, display: 'flex', gap: 32 }}>
                    <div><div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>Moins cher</div><div style={{ fontFamily: 'DM Mono, monospace', color: '#4ade80', fontWeight: 600 }}>{stats.min_quote.toLocaleString('fr-FR')} EUR</div></div>
                    <div><div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>Plus cher</div><div style={{ fontFamily: 'DM Mono, monospace', color: '#f87171', fontWeight: 600 }}>{stats.max_quote.toLocaleString('fr-FR')} EUR</div></div>
                    <div><div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>Ecart</div><div style={{ fontFamily: 'DM Mono, monospace', color: '#fbbf24', fontWeight: 600 }}>{(stats.max_quote - stats.min_quote).toLocaleString('fr-FR')} EUR</div></div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Droite */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 14 }}>Avancement</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}><span style={{ color: 'var(--text-secondary)' }}>Taux de reponse</span><span style={{ fontFamily: 'DM Mono, monospace' }}>{respPct}%</span></div>
              <ProgressBar value={respPct} variant={respPct >= 80 ? 'success' : respPct >= 50 ? 'warn' : 'danger'} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}><span style={{ color: 'var(--text-secondary)' }}>Delai consomme</span><span style={{ fontFamily: 'DM Mono, monospace', color: delayPct >= 85 ? '#f87171' : 'inherit' }}>{delayPct}%</span></div>
              <ProgressBar value={delayPct} variant={delayPct >= 85 ? 'danger' : delayPct >= 60 ? 'warn' : 'accent'} />
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 4 }}>Actions rapides</div>
            {!isWon && !isLost && <Button variant="primary" onClick={openConsultComposer} style={{ width: '100%', justifyContent: 'center' }}>Envoyer consultation</Button>}
            <Button variant="ghost" onClick={() => setShowAddQuote(true)} style={{ width: '100%', justifyContent: 'center' }}>+ Enregistrer un devis</Button>
            <button onClick={loadRelaunchHistory} style={{ width: '100%', padding: '6px 14px', border: '1px solid var(--border-hi)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Historique relances</button>
            {!isWon && <Button variant="success" loading={loadingAction === 'won'} onClick={() => action('won', () => markStatus('gagne'), 'AO Gagne')} style={{ width: '100%', justifyContent: 'center' }}>🏆 Marquer Gagne</Button>}
            {!isLost && <Button variant="danger" loading={loadingAction === 'lost'} onClick={() => action('lost', () => markStatus('perdu'), 'AO Perdu')} style={{ width: '100%', justifyContent: 'center' }}>❌ Marquer Perdu</Button>}
          </div>
        </div>
      </div>

      {/* Modal ajouter fournisseur */}
      <Modal open={showAddSupplier} onClose={() => setShowAddSupplier(false)} title="Ajouter un fournisseur">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Fournisseur</div>
          <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none' }}>
            <option value="">Selectionner...</option>
            {availableSuppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setShowAddSupplier(false)}>Annuler</Button>
          <Button variant="primary" loading={loadingAction === 'add-supplier'} onClick={async () => {
            if (!selectedSupplierId) return
            await action('add-supplier', () => addSupplier(selectedSupplierId), 'Fournisseur ajoute')
            setShowAddSupplier(false); setSelectedSupplierId('')
          }}>Ajouter</Button>
        </div>
      </Modal>

      {/* Modal devis */}
      <Modal open={showAddQuote} onClose={() => setShowAddQuote(false)} title="Enregistrer un devis recu">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Fournisseur *</div>
          <select value={quoteSupplier} onChange={e => setQuoteSupplier(e.target.value)} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none' }}>
            <option value="">Selectionner...</option>
            {tender.consultations.map((c: any) => <option key={c.supplier_id} value={c.supplier_id}>{c.supplier.name}</option>)}
          </select>
        </div>
        <Field label="Montant HT (EUR)" value={quotePriceHT} onChange={setQuotePriceHT} placeholder="Ex: 84500" />
        <Field label="Notes / Conditions" value={quoteNotes} onChange={setQuoteNotes} placeholder="Observations, delais..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={() => setShowAddQuote(false)}>Annuler</Button>
          <Button variant="primary" loading={savingQuote} onClick={saveQuote}>Enregistrer</Button>
        </div>
      </Modal>

      {/* Historique relances */}
      <Modal open={showRelaunchHistory} onClose={() => setShowRelaunchHistory(false)} title="Historique des relances">
        {relaunchHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Aucune relance effectuee</div>
        ) : relaunchHistory.map((r: any) => (
          <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{r.supplier?.name ?? 'Fournisseur inconnu'}</span>
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>Relance {r.relaunch_number}</span>
            </div>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
              <span>📅 {new Date(r.sent_at).toLocaleString('fr-FR')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{r.subject}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setShowRelaunchHistory(false)}>Fermer</Button>
        </div>
      </Modal>

      {/* Validation devis popup */}
      {showValidateQuote && validateQuoteSupplier && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowValidateQuote(false) }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 14, width: 640, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Valider le devis de {validateQuoteSupplier.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Choisissez qui recevra un email de notification</div>
              </div>
              <button onClick={() => setShowValidateQuote(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>Envoyer un email a</div>
                {tender.consultations.map((c: any) => {
                  const isWinner = c.supplier_id === validateQuoteSupplier.id
                  return (
                    <label key={c.supplier_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={validateRecipients.includes(c.supplier_id)}
                        onChange={e => { if (e.target.checked) setValidateRecipients(p => [...p, c.supplier_id]); else setValidateRecipients(p => p.filter(x => x !== c.supplier_id)) }}
                        style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{c.supplier.name}</span>
                      <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{c.supplier.email}</span>
                      {isWinner && <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '1px 6px', borderRadius: 5, fontFamily: 'DM Mono, monospace' }}>RETENU</span>}
                      {!isWinner && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>Email de refus automatique</span>}
                    </label>
                  )
                })}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Objet (pour le retenu)</div>
                <input value={validateSubject} onChange={e => setValidateSubject(e.target.value)} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Message (pour le retenu)</div>
                <textarea value={validateBody} onChange={e => setValidateBody(e.target.value)} rows={8} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', outline: 'none', resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <Button variant="ghost" onClick={() => setShowValidateQuote(false)}>Annuler</Button>
              <Button variant="success" loading={validating} onClick={handleValidateQuote}>Valider et envoyer les emails</Button>
            </div>
          </div>
        </div>
      )}

      {/* Compositeur consultation */}
      {showComposer && (
        <Composer title="Envoyer la consultation" onClose={() => setShowComposer(false)} subject={composerSubject} body={composerBody} onSubjectChange={setComposerSubject} onBodyChange={setComposerBody} onSend={sendConsultation} sending={sendingConsult} sendLabel={`Envoyer a ${selectedConsultSuppliers.length} fournisseur(s)`}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>Destinataires</div>
            {tender.consultations.map((c: any) => (
              <label key={c.supplier_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedConsultSuppliers.includes(c.supplier_id)} onChange={e => { if (e.target.checked) setSelectedConsultSuppliers(p => [...p, c.supplier_id]); else setSelectedConsultSuppliers(p => p.filter(x => x !== c.supplier_id)) }} style={{ accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{c.supplier.name}</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{c.supplier.email}</span>
                <ConsultationStatusBadge status={c.status} />
              </label>
            ))}
          </div>
        </Composer>
      )}

      {/* Compositeur relance */}
      {showRelaunchComposer && relaunchTarget && (
        <Composer title={`Relancer — ${relaunchTarget.supplier.name}`} onClose={() => setShowRelaunchComposer(false)} subject={relaunchSubject} body={relaunchBody} onSubjectChange={setRelaunchSubject} onBodyChange={setRelaunchBody} onSend={sendRelaunch} sending={sendingRelaunch} sendLabel="Envoyer la relance">
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '9px 13px', marginBottom: 14, fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>
            A : {relaunchTarget.supplier.email}
          </div>
        </Composer>
      )}
    </div>
  )
}
