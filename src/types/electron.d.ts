/** Pont exposé par electron/preload.js — présent uniquement dans l'app desktop. */
export interface OperisDesktopBridge {
  openFolder: (path: string) => Promise<{ success: boolean; error?: string }>
  selectFolder: () => Promise<{ canceled: boolean; path?: string }>
}

declare global {
  interface Window {
    operisDesktop?: OperisDesktopBridge
  }
}
