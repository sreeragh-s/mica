import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { api } from './api'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('notelab', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error legacy
  window.notelab = electronAPI
  // @ts-expect-error legacy
  window.api = api
}
