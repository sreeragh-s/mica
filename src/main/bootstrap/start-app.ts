import { app, session } from 'electron'
import { electronApp } from '@electron-toolkit/utils'

import { createWindow } from '../core/window'
import { watchWindowShortcutsDetachedDevTools } from '../core/shortcuts'
import { registerAppEvents, registerCoreIpc, registerLogIpc } from '../ipc/core-ipc'
import { registerDomainIpc } from '../ipc/domain-ipc'

function registerAppSecurity(): void {
  // Web Speech API uses Chromium's cloud service, so media permission requests are expected.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
}

function registerElectronAppMetadata(): void {
  electronApp.setAppUserModelId('io.notelab.app')

  app.on('browser-window-created', (_, window) => {
    watchWindowShortcutsDetachedDevTools(window)
  })
}

export function startApp(): void {
  registerAppEvents()

  app.whenReady().then(() => {
    registerAppSecurity()
    registerElectronAppMetadata()
    registerLogIpc()
    registerCoreIpc()
    registerDomainIpc()
    createWindow()
  })
}
