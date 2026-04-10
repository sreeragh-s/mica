import { registerAuthIpc } from '../auth/auth'
import { registerChatHistoryIpc } from '../chat/chat-history'
import { registerWorkspaceIpc } from '../workspace/workspace-ipc'
import { registerGitIpc } from '../git/git-ipc'
import { registerVectraEmbeddingsIpc } from '../ai/vectra-embeddings'
import { registerOllamaIpc } from '../ai/ollama'
import { registerUpdaterIpc } from '../updater/updater'

export function registerDomainIpc(): void {
  registerAuthIpc()
  registerChatHistoryIpc()
  registerWorkspaceIpc()
  registerGitIpc()
  registerVectraEmbeddingsIpc()
  registerOllamaIpc()
  registerUpdaterIpc()
}
