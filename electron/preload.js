const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('operisDesktop', {
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
})
