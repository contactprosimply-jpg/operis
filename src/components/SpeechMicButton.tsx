'use client'

import { useState } from 'react'

interface SpeechMicButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export default function SpeechMicButton({ onTranscript, disabled }: SpeechMicButtonProps) {
  const [listening, setListening] = useState(false)

  const startListening = () => {
    const w = window as Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
      SpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition
    if (!SR) {
      alert('Reconnaissance vocale non supportée. Utilisez Chrome ou Edge.')
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
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognition.start()
    setListening(true)
  }

  return (
    <button
      type="button"
      onClick={startListening}
      disabled={disabled || listening}
      title="Dicter (microphone)"
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
  onerror: () => void
  onend: () => void
  start: () => void
}
