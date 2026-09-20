export const THEMES = [
  {
    id: 'light',
    label: 'Clair',
    vars: {
      '--bg-primary': '#f8fafc',
      '--bg-secondary': '#f1f5f9',
      '--bg-card': '#ffffff',
      '--bg-hover': '#e2e8f0',
      '--text-primary': '#0f172a',
      '--text-secondary': '#475569',
      '--text-muted': '#64748b',
      '--shadow-sm': '0 1px 3px rgba(15,23,42,0.06)',
      '--shadow-md': '0 4px 16px rgba(15,23,42,0.08)',
      '--shadow-glow': '0 0 20px rgba(59,130,246,0.12)',
    },
    light: true,
  },
  {
    // Valeurs alignées exactement sur le design system Operis (dark navy officiel).
    id: 'dark',
    label: 'Sombre',
    vars: {
      '--bg-primary': '#080d18',
      '--bg-secondary': '#0f1624',
      '--bg-card': '#141c2e',
      '--bg-hover': '#1a2340',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#94a3b8',
      '--text-muted': '#7a869e',
      '--shadow-sm': '0 2px 8px rgba(0,0,0,0.4)',
      '--shadow-md': '0 4px 20px rgba(0,0,0,0.5)',
      '--shadow-glow': '0 0 24px rgba(79,142,247,0.15)',
    },
    light: false,
  },
  {
    id: 'navy',
    label: 'Marine',
    vars: {
      '--bg-primary': '#021246',
      '--bg-secondary': '#0a1f6e',
      '--bg-card': '#0d2580',
      '--bg-hover': '#1030a0',
      '--text-primary': '#e8eeff',
      '--text-secondary': '#93aedd',
      '--text-muted': '#4a6aaa',
      '--shadow-sm': '0 2px 8px rgba(0,0,0,0.4)',
      '--shadow-md': '0 4px 20px rgba(0,0,0,0.5)',
      '--shadow-glow': '0 0 24px rgba(79,142,247,0.2)',
    },
    light: false,
  },
] as const

// Le design system Operis impose le dark navy par défaut (pas de light mode) —
// voir spec UX. Le sélecteur de thème dans les paramètres reste disponible tel quel.
export const DEFAULT_THEME_ID = 'light'
export const DEFAULT_ACCENT = '#4f8ef7'

export function applyTheme(themeId: string, accent = DEFAULT_ACCENT) {
  const t = THEMES.find(th => th.id === themeId) ?? THEMES.find(th => th.id === DEFAULT_THEME_ID)!
  const root = document.documentElement
  Object.entries(t.vars).forEach(([key, val]) => root.style.setProperty(key, val))
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-soft', `${accent}18`)
  root.style.setProperty('--accent-2', accent)
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${accent} 0%, #6366f1 100%)`)
  root.style.setProperty('--gradient-logo', `linear-gradient(135deg, ${accent} 0%, #6366f1 100%)`)
  root.style.setProperty('--border', t.light ? 'rgba(15,23,42,0.08)' : 'rgba(148,163,184,0.1)')
  root.style.setProperty('--border-hi', t.light ? 'rgba(15,23,42,0.14)' : 'rgba(148,163,184,0.18)')
  root.style.setProperty('--success-soft', t.light ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.1)')
  root.style.setProperty('--warn-soft', t.light ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.1)')
  root.style.setProperty('--danger-soft', t.light ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.1)')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t.light ? '#f8fafc' : '#080d18')
}

export function loadStoredTheme() {
  if (typeof window === 'undefined') return { themeId: DEFAULT_THEME_ID, accent: DEFAULT_ACCENT }
  return {
    themeId: localStorage.getItem('operis_theme') ?? DEFAULT_THEME_ID,
    accent: localStorage.getItem('operis_accent') ?? DEFAULT_ACCENT,
  }
}

/**
 * Script inline exécuté avant le premier rendu : applique le thème mémorisé sans le flash
 * sombre → clair qu'on avait en attendant l'hydratation (ThemeBootstrap ne tourne qu'après).
 * Doit rester aligné sur applyTheme ci-dessus.
 */
export function themeInitScript(): string {
  const themes = Object.fromEntries(THEMES.map(t => [t.id, { light: t.light, vars: t.vars }]))
  return `(function(){try{var T=${JSON.stringify(themes)};var D='${DEFAULT_THEME_ID}';`
    + `var id=localStorage.getItem('operis_theme')||D;var a=localStorage.getItem('operis_accent')||'${DEFAULT_ACCENT}';`
    + `var t=T[id]||T[D];var s=document.documentElement.style;for(var k in t.vars)s.setProperty(k,t.vars[k]);`
    + `s.setProperty('--accent',a);s.setProperty('--accent-soft',a+'18');s.setProperty('--accent-2',a);`
    + `var g='linear-gradient(135deg, '+a+' 0%, #6366f1 100%)';s.setProperty('--gradient-primary',g);s.setProperty('--gradient-logo',g);`
    + `s.setProperty('--border',t.light?'rgba(15,23,42,0.08)':'rgba(148,163,184,0.1)');`
    + `s.setProperty('--border-hi',t.light?'rgba(15,23,42,0.14)':'rgba(148,163,184,0.18)');`
    + `s.setProperty('--success-soft',t.light?'rgba(16,185,129,0.12)':'rgba(16,185,129,0.1)');`
    + `s.setProperty('--warn-soft',t.light?'rgba(245,158,11,0.12)':'rgba(245,158,11,0.1)');`
    + `s.setProperty('--danger-soft','rgba(239,68,68,0.1)');`
    + `var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t.light?'#f8fafc':'#080d18')`
    + `}catch(e){}})();`
}
