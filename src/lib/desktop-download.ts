export type DesktopDownloadLinks = {
  windowsSetup: string | null
  windowsPortable: string | null
  version: string | null
}

export function getDesktopDownloadLinks(): DesktopDownloadLinks {
  return {
    windowsSetup: process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_URL?.trim() || null,
    windowsPortable: process.env.NEXT_PUBLIC_DESKTOP_PORTABLE_URL?.trim() || null,
    version: process.env.NEXT_PUBLIC_DESKTOP_VERSION?.trim() || null,
  }
}
