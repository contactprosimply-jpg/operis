import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'
import { downloadAttachmentBuffer } from '@/lib/mail-storage'
import { extractFinalPriceFromText, extractPriceFromTableRows } from '@/lib/quote-price-extract'

const MAX_PARSE_BYTES = 15 * 1024 * 1024

const DOC_EXT = /\.(pdf|docx?|xlsx?|xls|csv|txt)$/i
const DOC_MIME = /pdf|spreadsheet|excel|word|msword|officedocument|csv|plain/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i

const ROW_TOTAL_LABEL = /total|montant|net\s*[àa]\s*payer|devis|offre|ukupno|iznos|neto|gesamt|totale|za\s*uplatu|za\s*placanje|bez\s*pdv|sa\s*pdv/i

export function isQuoteDocument(filename: string, contentType?: string): boolean {
  if (IMAGE_EXT.test(filename)) return false
  if (contentType?.startsWith('image/')) return false
  if (DOC_EXT.test(filename)) return true
  if (contentType && DOC_MIME.test(contentType)) return true
  return false
}

interface DocumentTextResult {
  fullText: string
  endSection: string
  tableRows: string[][]
  /**
   * false quand `fullText` vient d'un repli binaire (PDF sans couche texte — scan/image —
   * ou .doc legacy décodé en latin1 depuis un format OLE compressé). Ce "texte" est du
   * bruit, pas du contenu réel : un montant qui y matche par coïncidence est un faux
   * positif, pas un prix. Les appelants ne doivent JAMAIS chercher de prix dedans —
   * mieux vaut aucun prix qu'un montant inventé.
   */
  reliable: boolean
}

async function extractPdfContent(buffer: Buffer): Promise<DocumentTextResult> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  let fullText = ''
  const pageTexts: string[] = []

  try {
    const result = await parser.getText()
    fullText = result.text ?? ''
    const total = result.total ?? 0
    for (let p = 1; p <= total; p++) {
      try {
        pageTexts.push(result.getPageText(p))
      } catch {
        break
      }
    }
  } catch (err) {
    console.error('[PDF] getText failed:', err)
  }

  const tableRows: string[][] = []
  try {
    const tables = await parser.getTable()
    let tableTail = ''
    for (const table of tables.mergedTables ?? []) {
      for (const row of table) {
        tableRows.push(row)
        const line = row.join(' ')
        fullText += '\n' + line
        tableTail += '\n' + line
      }
    }
    if (tableTail.trim()) pageTexts.push(tableTail)
  } catch {
    // tables optionnelles
  }

  // fullText vide ici = aucune couche texte exploitable (getText() ET getTable() n'ont
  // rien trouve) - typiquement un PDF scanne/image. On le note AVANT le repli binaire
  // ci-dessous, qui existe seulement pour ne pas planter l'apercu/l'affichage, jamais
  // pour y chercher un prix.
  const reliable = fullText.trim().length > 0

  if (!reliable) {
    fullText = buffer.toString('latin1').replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t€;,.\-+]/g, ' ')
  }

  const lastPages = pageTexts.length >= 2
    ? pageTexts.slice(-2).join('\n')
    : pageTexts.length === 1
      ? pageTexts[0]
      : fullText.slice(Math.floor(fullText.length * 0.55))

  return { fullText, endSection: lastPages, tableRows, reliable }
}

async function extractDocxContent(buffer: Buffer): Promise<DocumentTextResult> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  const fullText = result.value ?? ''
  return {
    fullText,
    endSection: fullText.slice(Math.floor(fullText.length * 0.55)),
    tableRows: [],
    reliable: true,
  }
}

function extractXlsxContent(buffer: Buffer): DocumentTextResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const parts: string[] = []
  const tailParts: string[] = []

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' })
    parts.push(`--- ${name} ---`)
    parts.push(csv)
    const lines = csv.split('\n')
    tailParts.push(lines.slice(Math.max(0, lines.length - 25)).join('\n'))
  }

  return {
    fullText: parts.join('\n'),
    endSection: tailParts.join('\n'),
    tableRows: [],
    reliable: true,
  }
}

/** Cherche le total final en scannant les lignes du bas vers le haut. */
export function extractPriceFromSpreadsheet(buffer: Buffer): number | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet || !sheet['!ref']) continue
    const range = XLSX.utils.decode_range(sheet['!ref'])

    for (let R = range.e.r; R >= range.s.r; R--) {
      let rowHasTotalLabel = false
      const rowNumbers: number[] = []

      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = sheet[addr]
        if (!cell) continue

        const strVal = cell.w ?? (typeof cell.v === 'string' ? cell.v : '')
        if (ROW_TOTAL_LABEL.test(String(strVal))) rowHasTotalLabel = true

        if (cell.t === 'n' && typeof cell.v === 'number') {
          const v = cell.v
          if (v >= 50 && v < 500_000_000) rowNumbers.push(v)
        } else if (cell.t === 's' && typeof cell.v === 'string') {
          const { price } = extractFinalPriceFromText(cell.v)
          if (price != null) rowNumbers.push(price)
        }
      }

      if (rowHasTotalLabel && rowNumbers.length) {
        return Math.max(...rowNumbers)
      }
    }
  }

  const { endSection } = extractXlsxContent(buffer)
  return extractFinalPriceFromText(endSection, endSection).price
}

export async function extractDocumentContent(
  filename: string,
  contentType: string,
  buffer: Buffer,
): Promise<DocumentTextResult> {
  if (buffer.length > MAX_PARSE_BYTES) return { fullText: '', endSection: '', tableRows: [], reliable: true }

  const lower = filename.toLowerCase()
  try {
    if (lower.endsWith('.pdf') || contentType.includes('pdf')) {
      return await extractPdfContent(buffer)
    }
    if (lower.endsWith('.docx') || contentType.includes('wordprocessingml')) {
      return await extractDocxContent(buffer)
    }
    if (/\.(xlsx?|xls|csv)$/i.test(lower) || /spreadsheet|excel|csv/i.test(contentType)) {
      return extractXlsxContent(buffer)
    }
    if (lower.endsWith('.txt') || contentType.includes('plain')) {
      const fullText = buffer.toString('utf8')
      return { fullText, endSection: fullText.slice(Math.floor(fullText.length * 0.55)), tableRows: [], reliable: true }
    }
    if (lower.endsWith('.doc')) {
      // Format OLE binaire compresse, pas du texte : decoder les octets bruts en latin1
      // ne recupere pas de contenu fiable (meme risque de faux positif qu'un PDF scanne).
      // On garde ce texte pour l'apercu, mais jamais pour y chercher un prix.
      const fullText = buffer.toString('latin1').replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t€;,.\-+]/g, ' ')
      return { fullText, endSection: fullText.slice(Math.floor(fullText.length * 0.55)), tableRows: [], reliable: false }
    }
  } catch (err) {
    console.error('[Doc extract]', filename, err)
  }
  return { fullText: '', endSection: '', tableRows: [], reliable: true }
}

/** @deprecated utilise extractDocumentContent */
export async function extractTextFromBuffer(
  filename: string,
  contentType: string,
  buffer: Buffer,
): Promise<string> {
  const { fullText } = await extractDocumentContent(filename, contentType, buffer)
  return fullText
}

export async function extractPriceFromAttachments(
  db: SupabaseClient,
  attachments: StoredEmailAttachment[],
): Promise<{
  price: number | null
  combinedText: string
  sourceFile?: string
  priceNote?: string
  /**
   * true si au moins une pièce jointe "devis" a été traitée mais sans aucune couche
   * texte fiable (PDF scanné/image, .doc legacy) et qu'aucun prix n'a pu être trouvé
   * ailleurs — jamais de prix deviné dans ce cas, l'appelant doit inviter à la saisie
   * manuelle plutôt que d'afficher un montant.
   */
  scannedWithoutText?: boolean
}> {
  let combinedText = ''
  let bestPrice: number | null = null
  let sourceFile: string | undefined
  let priceNote = ''
  let scannedWithoutText = false

  const sorted = [...attachments].sort((a, b) => {
    const aPdf = /\.pdf$/i.test(a.filename) ? 0 : 1
    const bPdf = /\.pdf$/i.test(b.filename) ? 0 : 1
    return aPdf - bPdf
  })

  for (const att of sorted) {
    if (!isQuoteDocument(att.filename, att.contentType)) continue

    const buffer = await downloadAttachmentBuffer(db, att)
    if (!buffer?.length) {
      console.error('[Doc extract] empty buffer:', att.filename, att.path)
      continue
    }

    const isSheet = /\.(xlsx?|xls|csv)$/i.test(att.filename) ||
      /spreadsheet|excel|csv/i.test(att.contentType ?? '')
    const isPdf = /\.pdf$/i.test(att.filename) || (att.contentType ?? '').includes('pdf')

    let filePrice: number | null = null
    let fileNote = ''

    if (isSheet) {
      filePrice = extractPriceFromSpreadsheet(buffer)
      if (filePrice != null) fileNote = 'Prix final (fin du tableau Excel)'
    }

    const { fullText, endSection, tableRows, reliable } = await extractDocumentContent(att.filename, att.contentType, buffer)

    if (!reliable) {
      // Pas de couche texte exploitable : ne jamais chercher/deviner un prix dans ce
      // contenu binaire, et ne pas le mélanger à combinedText (qui sert lui aussi de
      // repli pour l'extraction de prix côté appelant — voir mail-quote-extract.ts).
      if (filePrice == null) scannedWithoutText = true
      continue
    }

    if (fullText) combinedText += `\n--- ${att.filename} ---\n${fullText}`

    if (filePrice == null && tableRows.length) {
      const fromTable = extractPriceFromTableRows(tableRows)
      if (fromTable.price != null) {
        filePrice = fromTable.price
        fileNote = fromTable.note
      }
    }

    if (filePrice == null && (fullText || endSection)) {
      const extracted = extractFinalPriceFromText(fullText, endSection)
      filePrice = extracted.price
      fileNote = extracted.note
    }

    if (filePrice != null) {
      bestPrice = filePrice
      sourceFile = att.filename
      priceNote = fileNote || `Prix final extrait de ${att.filename}`
      if (isPdf) break
    }
  }

  return {
    price: bestPrice,
    combinedText,
    sourceFile,
    priceNote,
    scannedWithoutText: scannedWithoutText && bestPrice == null,
  }
}
