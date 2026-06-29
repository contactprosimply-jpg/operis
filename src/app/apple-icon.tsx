import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f8ef7 0%, #818cf8 100%)',
          fontSize: 72,
          fontWeight: 700,
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        OP
      </div>
    ),
    { ...size }
  )
}
