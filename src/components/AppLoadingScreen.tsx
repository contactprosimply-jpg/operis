'use client'

const BRAND_BG = '#021246'

export function AppLoadingScreen({ message }: { message?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      background: BRAND_BG,
    }}>
      <div style={{
        width: 52,
        height: 52,
        background: 'linear-gradient(135deg, #3b7fe8 0%, #1ecbe1 100%)',
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'DM Mono, monospace',
        fontSize: 17,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 28,
        boxShadow: 'var(--shadow-glow)',
      }}>
        OP
      </div>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'conic-gradient(from 0deg, #3b7fe8, #1ecbe1, transparent)',
        WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
        mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
        animation: 'spin 0.75s linear infinite',
      }} />
      {message && (
        <p style={{
          marginTop: 20,
          fontSize: 14,
          color: '#94a3b8',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {message}
        </p>
      )}
    </div>
  )
}
