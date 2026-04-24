'use client'
// ============================================================
// OPERIS — app/login/page.tsx
// Page de connexion
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#021246] flex items-center justify-center">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center font-mono text-lg font-medium text-white">
            OP
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-white mb-1">Connexion à Operis</h1>
          <p className="text-sm text-slate-400">Gestion des appels d'offres BTP</p>
        </div>

        {/* Formulaire */}
        <div className="bg-[#0a1f6e]/50 border border-blue-500/20 rounded-2xl p-8">
          <form onSubmit={handleLogin}>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5 text-xs text-red-400">
                {error}
              </div>
            )}

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
                placeholder="••••••••"
                required
                className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

          </form>

          <div className="mt-5 text-center">
            <span className="text-xs text-slate-500">Pas encore de compte ? </span>
            <a href="/register" className="text-xs text-blue-400 hover:text-blue-300">
              Créer un compte
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
