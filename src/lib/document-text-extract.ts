import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'
import { downloadAttachmentBuffer } from '@/lib/mail-storage'
import { extractPriceFromText } from '@/lib/quote-price-extract'

const MAX_PARSE_BYTES = 15 * 1024 * 1024

const DOC_EXT = /\.(pdf|docx?|xlsx?|xls|csv|txt)$/i
const DOC_MIME = /pdf|spreadsheet|excel|word|msword|officedocument|csv|plain/i

export function isQuoteDocument(filename: string, contentType?: string): boolean {
  if (DOC_EXT.test(filename)) return true
  if (contentType && DOC_MIME.test(contentType)) return true
  return false
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  return result.text ?? ''
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value ?? ''
}

function extractXlsxText(buffer: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const parts: string[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    parts.push(`--- ${name} ---`)
    parts.push(XLSX.utils.sheet_to_csv(sheet, { FS: ';' }))
  }
  return parts.join('\n')
}

/** Cherche le total dans une feuille Excel (lignes « Total », « Montant », etc.). */
export function extractPriceFromSpreadsheet(buffer: Buffer): number | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const labeledTotals: number[] = []
  const allNumbers: number[] = []

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet || !sheet['!ref']) continue
    const range = XLSX.utils.decode_range(sheet['!ref'])

    for (let R = range.s.r; R <= range.e.r; R++) {
      let rowHasTotalLabel = false
      const rowNumbers: number[] = []

      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = sheet[addr]
        if (!cell) continue

        const strVal = cell.w ?? (typeof cell.v === 'string' ? cell.v : '')
        if (/total|montant|net\s*[àa]\s*payer|devis|offre/i.test(String(strVal))) {
          rowHasTotalLabel = true
        }

        if (cell.t === 'n' && typeof cell.v === 'number') {
          const v = cell.v
          if (v >= 50 && v < 100_000_000) {
            rowNumbers.push(v)
            allNumbers.push(v)
          }
        } else if (cell.t === 's' && typeof cell.v === 'string') {
          const p = extractPriceFromText(cell.v)
          if (p != null) {
            rowNumbers.push(p)
            allNumbers.push(p)
          }
        }
      }

      if (rowHasTotalLabel && rowNumbers.length) {
        labeledTotals.push(Math.max(...rowNumbers))
      }
    }
  }

  if (labeledTotals.length) return Math.max(...labeledTotals)
  if (allNumbers.length) return Math.max(...allNumbers)
  return null
}

export async function extractTextFromBuffer(
  filename: string,
  contentType: string,
  buffer: Buffer,
): Promise<string> {
  if (buffer.length > MAX_PARSE_BYTES) return ''

  const lower = filename.toLowerCase()
  try {
    if (lower.endsWith('.pdf') || contentType.includes('pdf')) {
      return await extractPdfText(buffer)
    }
    if (lower.endsWith('.docx') || contentType.includes('wordprocessingml')) {
      return await extractDocxText(buffer)
    }
    if (/\.(xlsx?|xls|csv)$/i.test(lower) || /spreadsheet|excel|csv/i.test(contentType)) {
      return extractXlsxText(buffer)
    }
    if (lower.endsWith('.txt') || contentType.includes('plain')) {
      return buffer.toString('utf8')
    }
    if (lower.endsWith('.doc')) {
      // .doc binaire — extraction partielle via texte brut
      return buffer.toString('latin1').replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t€;,.\-+]/g, ' ')
    }
  } catch (err) {
    console.error('[Doc extract]', filename, err)
  }
  return ''
}

export async function extractPriceFromAttachments(
  db: SupabaseClient,
  attachments: StoredEmailAttachment[],
): Promise<{ price: number | null; combinedText: string; sourceFile?: string }> {
  let combinedText = ''
  let bestPrice: number | null = null
  let sourceFile: string | undefined

  for (const att of attachments) {
    if (!isQuoteDocument(att.filename, att.contentType)) continue

    const buffer = await downloadAttachmentBuffer(db, att)
    if (!buffer?.length) continue

    const isSheet = /\.(xlsx?|xls|csv)$/i.test(att.filename) ||
      /spreadsheet|excel|csv/i.test(att.contentType ?? '')

    let filePrice: number | null = null
    if (isSheet) {
      filePrice = extractPriceFromSpreadsheet(buffer)
    }

    const text = await extractTextFromBuffer(att.filename, att.contentType, buffer)
    if (text) combinedText += `\n--- ${att.filename} ---\n${text}`

    if (filePrice == null && text) {
      filePrice = extractPriceFromText(text, true)
    }

    if (filePrice != null) {
      if (bestPrice == null || filePrice > bestPrice) {
        bestPrice = filePrice
        sourceFile = att.filename
      }
    }
  }

  return { price: bestPrice, combinedText, sourceFile }
}
