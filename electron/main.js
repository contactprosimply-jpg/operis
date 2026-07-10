const { app, BrowserWindow, shell, nativeImage, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4h

// Version téléchargée et prête à installer — jamais appliquée de force en pleine
// session (perte de brouillon de mail, page AO en cours, etc.) : on prévient le
// renderer qui affiche un petit bandeau non fermable tant que l'utilisateur n'a
// pas cliqué "Redémarrer" lui-même.
let updateReadyVersion = null

function broadcastUpdateReady() {
  BrowserWindow.getAllWindows().forEach(win => win.webContents.send('operis:update-ready', updateReadyVersion))
}

/** Mise à jour automatique du shell desktop — téléchargée en tâche de fond, jamais
 *  installée de force : le renderer est prévenu et laisse l'utilisateur choisir le moment. */
function initAutoUpdate() {
  if (!app.isPackaged) return // pas de check en dev (electron .)

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', err => console.error('[autoUpdater]', err?.message ?? err))
  autoUpdater.on('update-downloaded', info => {
    console.info('[autoUpdater] mise à jour téléchargée, en attente de redémarrage:', info?.version)
    updateReadyVersion = info?.version ?? true
    broadcastUpdateReady()
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

/** État courant de la mise à jour — interrogé par le renderer au montage (l'événement
 *  'update-downloaded' a pu arriver avant que le bandeau ne soit monté). */
ipcMain.handle('operis:get-update-status', () => updateReadyVersion)

/** Déclenché uniquement par un clic explicite de l'utilisateur sur "Redémarrer". */
ipcMain.handle('operis:install-update', () => {
  autoUpdater.quitAndInstall()
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
