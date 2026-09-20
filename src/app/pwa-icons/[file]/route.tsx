import { ImageResponse } from 'next/og'

// Le suffixe .png garde ces URLs hors du redirect de connexion du middleware (pathname avec « . »),
// car le navigateur les lit sans cookie pour juger l'installabilité de la PWA.
const VARIANTS: Record<string, { size: number; maskable: boolean }> = {
  'any-192.png': { size: 192, maskable: false },
  'any-512.png': { size: 512, maskable: false },
  // Maskable : fond plein jusqu'aux bords (Android le découpe en cercle/squircle) et logo dans la
  // zone de sécurité centrale (80 %), sinon il est rogné.
  'maskable-512.png': { size: 512, maskable: true },
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const v = VARIANTS[file]
  if (!v) return new Response('Not found', { status: 404 })

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
          borderRadius: v.maskable ? 0 : Math.round(v.size * 0.1875),
          fontSize: Math.round(v.size * (v.maskable ? 0.27 : 0.35)),
          fontWeight: 700,
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        OP
      </div>
    ),
    { width: v.size, height: v.size, headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
  )
}
