const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('operisDesktop', {
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getUpdateStatus: () => ipcRenderer.invoke('operis:get-update-status'),
  onUpdateReady: (callback) => {
    const listener = (_event, version) => callback(version)
    ipcRenderer.on('operis:update-ready', listener)
    return () => ipcRenderer.removeListener('operis:update-ready', listener)
  },
  installUpdate: () => ipcRenderer.invoke('operis:install-update'),
})
