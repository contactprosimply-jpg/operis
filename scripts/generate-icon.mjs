import sharp from 'sharp'
import toIco from 'to-ico'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'electron')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4f8ef7"/>
      <stop offset="1" stop-color="#818cf8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <text x="256" y="290" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="160" font-weight="700" fill="#ffffff">OP</text>
</svg>`

const buf = Buffer.from(svg)

await sharp(buf).png().toFile(join(outDir, 'icon.png'))

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map(s => sharp(buf).resize(s, s).png().toBuffer())
)
writeFileSync(join(outDir, 'icon.ico'), await toIco(pngBuffers))

console.log('Icons generated in electron/ (png + ico)')
