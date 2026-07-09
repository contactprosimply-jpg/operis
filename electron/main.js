const { app, BrowserWindow, shell, nativeImage, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4h

/** Mise à jour automatique du shell desktop — silencieuse, installée au prochain
 *  redémarrage naturel de l'app (jamais d'interruption forcée en pleine session). */
function initAutoUpdate() {
  if (!app.isPackaged) return // pas de check en dev (electron .)

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', err => console.error('[autoUpdater]', err?.message ?? err))
  autoUpdater.on('update-downloaded', info => {
    console.info('[autoUpdater] mise à jour téléchargée, installation au prochain redémarrage:', info?.version)
  })

  const check = () => autoUpdater.checkForUpdates().catch(err => console.error('[autoUpdater] check failed', err))
  check()
  setInterval(check, UPDATE_CHECK_INTERVAL_MS)
}

const APP_BASE = (process.env.OPERIS_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://operis-pro.com').replace(/\/$/, '')
/** Application métier (dashboard) — le site vitrine reste sur operis-pro.com sans sidebar app. */
const APP_URL = process.env.OPERIS_ENTRY || `${APP_BASE}/dashboard`
const ALLOWED_HOSTS = ['operis-pro.com', 'www.operis-pro.com', 'operis-f26g7.vercel.app', 'localhost', '127.0.0.1']

function isAllowedUrl(url) {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.vercel.app'))
  } catch {
    return false
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#080d18',
    title: 'Operis — Gestion AO BTP',
    show: false,
    autoHideMenuBar: true,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  win.loadURL(APP_URL)
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.operis.app')
}

/** Ouvre un chemin local/réseau dans l'Explorateur — saisi manuellement par l'utilisateur sur une fiche AO. */
ipcMain.handle('open-folder', async (_event, folderPath) => {
  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    return { success: false, error: 'Chemin vide' }
  }
  const normalized = folderPath.trim()
  if (!fs.existsSync(normalized)) {
    return { success: false, error: 'Dossier introuvable — vérifiez le chemin' }
  }
  const result = await shell.openPath(normalized)
  if (result) return { success: false, error: result }
  return { success: true }
})

/** Sélecteur de dossier natif Windows — évite les erreurs de saisie manuelle (typos,
 *  lettre de lecteur réseau invalide, etc.) en garantissant un chemin réellement existant. */
ipcMain.handle('select-folder', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths.length) return { canceled: true }
  return { canceled: false, path: result.filePaths[0] }
})

app.whenReady().then(() => {
  createWindow()
  initAutoUpdate()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
