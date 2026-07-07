'use client'

import { useState } from 'react'

interface SpeechMicButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

/** Electron embarque Chromium mais pas le service cloud de reconnaissance vocale de Google
 *  utilisé par webkitSpeechRecognition — le bouton ne peut jamais fonctionner dans l'app desktop. */
function isElectronRenderer(): boolean {
  return typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)
}

function errorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return 'Accès au micro refusé — autorisez-le dans les paramètres du navigateur.'
    case 'no-speech':
      return 'Aucune parole détectée.'
    case 'audio-capture':
      return 'Aucun micro détecté.'
    case 'network':
      return 'Reconnaissance vocale indisponible (réseau).'
    default:
      return 'Dictée vocale indisponible.'
  }
}

export default function SpeechMicButton({ onTranscript, disabled }: SpeechMicButtonProps) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const electron = isElectronRenderer()

  const startListening = () => {
    setError(null)

    if (electron) {
      setError('Dictée vocale indisponible dans l\'application desktop — utilisez la version web.')
      return
    }

    const w = window as Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
      SpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition
    if (!SR) {
      setError('Reconnaissance vocale non supportée — utilisez Chrome ou Edge.')
      return
    }

    const recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (e: SpeechRecognitionEventLike) => {
      const transcript = e.results[0]?.[0]?.transcript
      if (transcript) onTranscript(transcript)
    }
    recognition.onerror = (e: { error?: string }) => {
      setListening(false)
      setError(errorMessage(e.error ?? ''))
    }
    recognition.onend = () => setListening(false)

    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Impossible de démarrer la dictée vocale.')
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, position: 'relative' }}>
      <button
        type="button"
        onClick={startListening}
        disabled={disabled || listening}
        title={electron ? 'Indisponible dans l\'application desktop' : 'Dicter (microphone)'}
        style={{
          background: listening ? 'rgba(239,68,68,0.15)' : 'var(--bg-hover)',
          border: `1px solid ${listening ? 'rgba(239,68,68,0.4)' : 'var(--border-hi)'}`,
          borderRadius: 8,
          padding: '6px 10px',
          cursor: disabled || listening ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'DM Sans, system-ui',
          fontSize: 12,
          color: listening ? '#f87171' : 'var(--text-secondary)',
          flexShrink: 0,
          opacity: electron ? 0.6 : 1,
        }}
      >
        🎤
        {listening && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
            animation: 'pulse 0.8s ease infinite',
          }} />
        )}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: '#f87171', fontFamily: 'DM Sans, system-ui' }}>
          {error}
        </span>
      )}
    </span>
  )
}

interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: { transcript: string } } }
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: (e: SpeechRecognitionEventLike) => void
  onerror: (e: { error?: string }) => void
  onend: () => void
  start: () => void
}
