'use client'
// ============================================================
// OPERIS — app/register/page.tsx
// Page d'inscription
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#021246] flex items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Compte créé !</h2>
          <p className="text-sm text-slate-400 mb-6">
            Vérifie ta boîte mail et clique sur le lien de confirmation.
          </p>
          <a href="/login" className="text-sm text-blue-400 hover:text-blue-300">
            Retour à la connexion →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#021246] flex items-center justify-center">
      <div className="w-full max-w-md">

        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center font-mono text-lg font-medium text-white">
            OP
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-white mb-1">Créer un compte</h1>
          <p className="text-sm text-slate-400">Operis — Gestion AO BTP</p>
        </div>

        <div className="bg-[#0a1f6e]/50 border border-blue-500/20 rounded-2xl p-8">
          <form onSubmit={handleRegister}>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">
                Nom complet
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Uros Nikodex"
                required
                className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="mb-4">
              <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.fr"
                required
                className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="mb-6">
              <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                required
                className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>

          </form>

          <div className="mt-5 text-center">
            <span className="text-xs text-slate-500">Déjà un compte ? </span>
            <a href="/login" className="text-xs text-blue-400 hover:text-blue-300">
              Se connecter
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
