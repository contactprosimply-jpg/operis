import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: 96,
          fontSize: 180,
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
