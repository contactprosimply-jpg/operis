export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: 'var(--border)' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 2) return { score: 33, label: 'Faible', color: '#ef4444' }
  if (score <= 3) return { score: 66, label: 'Moyen', color: '#f59e0b' }
  return { score: 100, label: 'Fort', color: '#10b981' }
}
