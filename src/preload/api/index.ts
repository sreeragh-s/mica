import { authApi } from './auth'
import { chatHistoryApi } from './chat-history'
import { workspaceApi } from './workspace'
import { clipboardApi, logApi, multiWindowApi, updaterApi, windowApi } from './system'
import { embeddingsApi, ollamaApi } from './ai'

export const api = {
  clipboard: clipboardApi,
  auth: authApi,
  chatHistory: chatHistoryApi,
  workspace: workspaceApi,
  window: windowApi,
  ollama: ollamaApi,
  log: logApi,
  embeddings: embeddingsApi,
  updater: updaterApi,
  multiWindow: multiWindowApi,
}
