/** Fusion simple de classes Tailwind (sans dépendance externe). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
