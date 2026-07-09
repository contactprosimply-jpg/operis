import packageJson from '../../package.json'

export const DESKTOP_RELEASE_BUCKET = 'desktop-releases'
/** Toujours synchronisée avec package.json — c'est aussi la version que compare
 *  electron-updater (autoUpdater) pour décider si une mise à jour est disponible. */
export const DESKTOP_VERSION = packageJson.version

export const DESKTOP_ARTIFACTS = {
  setup: `Operis-Setup-${DESKTOP_VERSION}.exe`,
  portable: `Operis-Portable-${DESKTOP_VERSION}.exe`,
} as const

export type DesktopVariant = keyof typeof DESKTOP_ARTIFACTS

export type DesktopDownloadLinks = {
  windowsSetup: string | null
  windowsPortable: string | null
  version: string
}

/** Liens statiques (public/downloads ou CDN). L'API /api/desktop/download est préférée. */
export function getDesktopDownloadLinks(): DesktopDownloadLinks {
  const version = process.env.NEXT_PUBLIC_DESKTOP_VERSION?.trim() || DESKTOP_VERSION
  const setupName = `Operis-Setup-${version}.exe`
  const portableName = `Operis-Portable-${version}.exe`

  return {
    windowsSetup:
      process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_URL?.trim()
      || `/downloads/${setupName}`,
    windowsPortable:
      process.env.NEXT_PUBLIC_DESKTOP_PORTABLE_URL?.trim()
      || `/downloads/${portableName}`,
    version,
  }
}
