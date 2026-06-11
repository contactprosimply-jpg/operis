const { app, BrowserWindow, shell, nativeImage } = require('electron')
const path = require('path')

const APP_BASE = (process.env.OPERIS_URL || 'https://operis-f26g78.vercel.app').replace(/\/$/, '')
/** Entrée application (login → AO), pas la page marketing */
const APP_URL = process.env.OPERIS_ENTRY || `${APP_BASE}/app`
const ALLOWED_HOSTS = ['operis-f26g78.vercel.app', 'localhost', '127.0.0.1']

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
  app.setAppUserModelId('fr.nikodex.operis')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
