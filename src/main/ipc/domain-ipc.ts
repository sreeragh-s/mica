import { registerAuthIpc } from '../auth/auth'
import { registerChatHistoryIpc } from '../chat/chat-history'
import { registerWorkspaceIpc } from '../workspace/workspace-ipc'
import { registerGitIpc } from '../git/git-ipc'
import { registerSQLiteVectorEmbeddingsIpc } from '../ai/sqlite-vector-embeddings'
import { registerOllamaIpc } from '../ai/ollama'
import { registerUpdaterIpc } from '../updater/updater'

export function registerDomainIpc(): void {
  registerAuthIpc()
  registerChatHistoryIpc()
  registerWorkspaceIpc()
  registerGitIpc()
  registerSQLiteVectorEmbeddingsIpc()
  registerOllamaIpc()
  registerUpdaterIpc()
}
