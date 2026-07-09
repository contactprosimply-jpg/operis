import { useId } from 'react'

export function OperisLogoMark({ size = 40, glow = false }: { size?: number; glow?: boolean }) {
  const clipId = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={glow ? { filter: 'drop-shadow(0 0 10px rgba(79,142,247,0.45))' } : undefined}
      aria-label="Operis"
      role="img"
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points="38,0 100,0 100,62 58,20" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="32" fill="none" stroke="#021246" strokeWidth="20" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="#4f8ef7" strokeWidth="20" clipPath={`url(#${clipId})`} />
    </svg>
  )
}
