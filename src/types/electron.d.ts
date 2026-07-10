/** Pont exposé par electron/preload.js — présent uniquement dans l'app desktop. */
export interface OperisDesktopBridge {
  openFolder: (path: string) => Promise<{ success: boolean; error?: string }>
  selectFolder: () => Promise<{ canceled: boolean; path?: string }>
  getUpdateStatus: () => Promise<string | boolean | null>
  onUpdateReady: (callback: (version: string | boolean) => void) => () => void
  installUpdate: () => Promise<void>
}

declare global {
  interface Window {
    operisDesktop?: OperisDesktopBridge
  }
}
