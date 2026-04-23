"use client"

import { AlertCircleIcon, BotIcon, CheckIcon } from "lucide-react"
import { nanoid } from "nanoid"
import * as React from "react"
import { toast } from "sonner"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai/message"
import {
  LocalModelSelectorEmptyState,
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai/model-selector"
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai/suggestion"
import { useLocalModels } from "@/hooks/use-local-models"
import { type OllamaChatMessage, streamOllamaChat } from "@/lib/ollama-chat"

type ChatEntry = {
  id: string
  role: "user" | "assistant"
  content: string
  state: "ready" | "streaming" | "error"
}

const suggestions = [
  "Summarize the current note into key takeaways.",
  "Turn these ideas into an action plan.",
  "Help me brainstorm next steps for this project.",
  "Rewrite this in a clearer, more concise way.",
]

const assistantWelcome =
  "Choose one of your configured local models and start chatting. Responses in this sidebar are sent to Ollama."

function buildOllamaMessages(messages: ChatEntry[]): OllamaChatMessage[] {
  return messages
    .filter(message => message.state !== "error")
    .map(message => ({
      role: message.role,
      content: message.content,
    }))
}

const ChatMessages = React.memo(function ChatMessages({
  configuredModelsCount,
  messages,
}: {
  configuredModelsCount: number
  messages: ChatEntry[]
}) {
  return (
    <Conversation className="min-h-0 flex-1 border-b">
      <ConversationContent>
        {messages.length ? (
          messages.map(message => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                <MessageResponse>{message.content}</MessageResponse>
              </MessageContent>
            </Message>
          ))
        ) : (
          <ConversationEmptyState
            description={
              configuredModelsCount
                ? assistantWelcome
                : "Add a local Ollama model in Settings to start chatting here."
            }
            icon={
              configuredModelsCount ? (
                <BotIcon className="size-10 opacity-40" />
              ) : (
                <AlertCircleIcon className="size-10 opacity-40" />
              )
            }
            title={configuredModelsCount ? "Local chat is ready" : "No local models available"}
          />
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
})

const ChatComposer = React.memo(function ChatComposer({
  configuredModels,
  isChatDisabled,
  localModelsLoading,
  ollamaStatusRunning,
  onSend,
  selectedModel,
  selectedModelId,
  setModelSelectorOpen,
  setSelectedModelId,
  status,
}: {
  configuredModels: ReturnType<typeof useLocalModels>["configuredModels"]
  isChatDisabled: boolean
  localModelsLoading: boolean
  ollamaStatusRunning: boolean
  onSend: (content: string) => Promise<void>
  selectedModel: ReturnType<typeof useLocalModels>["configuredModels"][number] | undefined
  selectedModelId: string
  setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedModelId: React.Dispatch<React.SetStateAction<string>>
  status: "submitted" | "streaming" | "ready" | "error"
}) {
  const [text, setText] = React.useState("")
  const [modelSelectorOpen, setLocalModelSelectorOpen] = React.useState(false)

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setLocalModelSelectorOpen(open)
      setModelSelectorOpen(open)
    },
    [setModelSelectorOpen],
  )

  const handleSubmit = React.useCallback(
    async (message: PromptInputMessage) => {
      if (message.files?.length) {
        toast("Attachments are not sent to Ollama yet.", {
          description: "The sidebar chat currently sends text only.",
        })
      }

      const nextText = message.text || ""
      await onSend(nextText)
      setText("")
    },
    [onSend],
  )

  const handleSuggestionClick = React.useCallback(
    async (suggestion: string) => {
      await onSend(suggestion)
      setText("")
    },
    [onSend],
  )

  React.useEffect(() => {
    if (!selectedModelId && text) {
      setText("")
    }
  }, [selectedModelId, text])

  return (
    <div className="shrink-0 space-y-4 px-4 pt-4 pb-4">
      <Suggestions>
        {suggestions.map(suggestion => (
          <Suggestion
            key={suggestion}
            onClick={() => void handleSuggestionClick(suggestion)}
            suggestion={suggestion}
          />
        ))}
      </Suggestions>

      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
          <PromptInputTextarea
            onChange={event => setText(event.target.value)}
            placeholder={
              selectedModel
                ? `Message ${selectedModel.name}...`
                : "Choose a local model to start chatting..."
            }
            value={text}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ModelSelector onOpenChange={handleOpenChange} open={modelSelectorOpen}>
              <ModelSelectorTrigger asChild>
                <PromptInputButton>
                  {selectedModel ? <ModelSelectorLogo provider="ollama" /> : null}
                  <ModelSelectorName>
                    {selectedModel?.name ?? "Choose local model"}
                  </ModelSelectorName>
                </PromptInputButton>
              </ModelSelectorTrigger>
              <ModelSelectorContent>
                <ModelSelectorInput placeholder="Search local models..." />
                <ModelSelectorList>
                  {!configuredModels.length && !localModelsLoading ? (
                    <LocalModelSelectorEmptyState
                      isOllamaRunning={ollamaStatusRunning}
                      onNavigateToSettings={() => handleOpenChange(false)}
                    />
                  ) : null}
                  {configuredModels.length ? (
                    <>
                      <ModelSelectorEmpty>No matching local models.</ModelSelectorEmpty>
                      <ModelSelectorGroup heading="Local Models">
                        {configuredModels.map(model => (
                          <ModelSelectorItem
                            key={model.id}
                            onSelect={() => {
                              setSelectedModelId(model.name)
                              handleOpenChange(false)
                            }}
                            value={`${model.name} ${model.id}`}
                          >
                            <ModelSelectorLogo provider="ollama" />
                            <ModelSelectorName>{model.name}</ModelSelectorName>
                            {selectedModel?.id === model.id ? (
                              <CheckIcon className="ml-auto size-4" />
                            ) : (
                              <div className="ml-auto size-4" />
                            )}
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    </>
                  ) : null}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </PromptInputTools>
          <PromptInputSubmit disabled={isChatDisabled || !text.trim()} status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
})

export function Chat({
  onConversationStateChange,
}: {
  onConversationStateChange?: (hasConversation: boolean) => void
} = {}) {
  const { configuredModels, isLoading: localModelsLoading, ollamaStatus } = useLocalModels()
  const [messages, setMessages] = React.useState<ChatEntry[]>([])
  const [status, setStatus] = React.useState<"submitted" | "streaming" | "ready" | "error">(
    "ready",
  )
  const [selectedModelId, setSelectedModelId] = React.useState("")
  const [_modelSelectorOpen, setModelSelectorOpen] = React.useState(false)

  const selectedModel = React.useMemo(
    () => configuredModels.find(model => model.id === selectedModelId) ?? configuredModels[0],
    [configuredModels, selectedModelId],
  )

  React.useEffect(() => {
    if (!configuredModels.length) {
      if (selectedModelId) {
        setSelectedModelId("")
      }
      return
    }

    if (!configuredModels.some(model => model.id === selectedModelId)) {
      setSelectedModelId(configuredModels[0]!.id)
    }
  }, [configuredModels, selectedModelId])

  const sendMessage = React.useCallback(
    async (content: string) => {
      if (!selectedModel) {
        setModelSelectorOpen(true)
        toast.error("Choose a local model in Settings before chatting.")
        return
      }

      const trimmedContent = content.trim()
      if (!trimmedContent) {
        return
      }

      const userMessage: ChatEntry = {
        id: nanoid(),
        role: "user",
        content: trimmedContent,
        state: "ready",
      }
      const assistantMessageId = nanoid()
      const assistantPlaceholder: ChatEntry = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        state: "streaming",
      }

      const nextMessages = [...messages, userMessage]

      setMessages([...nextMessages, assistantPlaceholder])
      setStatus("submitted")

      let accumulated = ""
      let firstChunkReceived = false

      try {
        await streamOllamaChat({
          chatId: assistantMessageId,
          model: selectedModel.name,
          messages: buildOllamaMessages(nextMessages),
          smooth: { chunking: "word", delayInMs: 15 },
          onDelta: delta => {
            accumulated += delta
            if (!firstChunkReceived) {
              firstChunkReceived = true
              setStatus("streaming")
            }
            setMessages(currentMessages =>
              currentMessages.map(message =>
                message.id === assistantMessageId
                  ? { ...message, content: accumulated, state: "streaming" }
                  : message,
              ),
            )
          },
        })

        setMessages(currentMessages =>
          currentMessages.map(message =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: accumulated.trim() || "No response returned.",
                  state: "ready",
                }
              : message,
          ),
        )
        setStatus("ready")
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong while talking to Ollama."

        setMessages(currentMessages =>
          currentMessages.map(entry =>
            entry.id === assistantMessageId
              ? {
                  ...entry,
                  content: accumulated.trim()
                    ? `${accumulated.trim()}\n\n_${message}_`
                    : message,
                  state: "error",
                }
              : entry,
          ),
        )
        setStatus("error")
        toast.error("Chat failed", {
          description: message,
        })
      }
    },
    [messages, selectedModel],
  )

  const isChatDisabled = !selectedModel || status === "streaming"

  React.useEffect(() => {
    onConversationStateChange?.(messages.length > 0)
  }, [messages.length, onConversationStateChange])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <ChatMessages configuredModelsCount={configuredModels.length} messages={messages} />
      <ChatComposer
        configuredModels={configuredModels}
        isChatDisabled={isChatDisabled}
        localModelsLoading={localModelsLoading}
        ollamaStatusRunning={ollamaStatus.running}
        onSend={sendMessage}
        selectedModel={selectedModel}
        selectedModelId={selectedModelId}
        setModelSelectorOpen={setModelSelectorOpen}
        setSelectedModelId={setSelectedModelId}
        status={status}
      />
    </div>
  )
}

export default Chat
