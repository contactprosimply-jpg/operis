import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEMES, applyTheme, themeInitScript } from '@/lib/theme'

/** Faux document/localStorage minimaux : on capture les variables CSS posées sur <html>. */
function fakeDom(stored: Record<string, string>) {
  const vars = new Map<string, string>()
  const meta = { content: '', setAttribute(_: string, v: string) { this.content = v } }
  const doc = {
    documentElement: { style: { setProperty: (k: string, v: string) => { vars.set(k, v) } } },
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null),
  }
  const storage = { getItem: (k: string) => stored[k] ?? null }
  return { vars, meta, doc, storage }
}

function runInitScript(stored: Record<string, string>) {
  const dom = fakeDom(stored)
  new Function('document', 'localStorage', themeInitScript())(dom.doc, dom.storage)
  return dom
}

function runApplyTheme(themeId: string, accent: string) {
  const dom = fakeDom({})
  vi.stubGlobal('document', dom.doc)
  applyTheme(themeId, accent)
  return dom
}

afterEach(() => vi.unstubAllGlobals())

describe('themeInitScript', () => {
  it('pose exactement les mêmes variables que applyTheme, pour chaque thème', () => {
    for (const t of THEMES) {
      const fromScript = runInitScript({ operis_theme: t.id, operis_accent: '#10b981' })
      const fromApply = runApplyTheme(t.id, '#10b981')
      expect(Object.fromEntries(fromScript.vars)).toEqual(Object.fromEntries(fromApply.vars))
      expect(fromScript.meta.content).toBe(fromApply.meta.content)
    }
  })

  it('retombe sur le thème clair par défaut sans préférence mémorisée', () => {
    const fromScript = runInitScript({})
    expect(fromScript.vars.get('--bg-primary')).toBe('#f8fafc')
    expect(fromScript.meta.content).toBe('#f8fafc')
  })

  it("ignore un thème inconnu au lieu de planter", () => {
    const fromScript = runInitScript({ operis_theme: 'inexistant' })
    expect(fromScript.vars.get('--bg-primary')).toBe('#f8fafc')
  })

  it("ne lève jamais d'exception si localStorage est inaccessible", () => {
    const dom = fakeDom({})
    const broken = { getItem: () => { throw new Error('SecurityError') } }
    expect(() => new Function('document', 'localStorage', themeInitScript())(dom.doc, broken)).not.toThrow()
  })
})
