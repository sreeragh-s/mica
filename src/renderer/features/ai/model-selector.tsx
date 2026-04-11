import type { ComponentProps } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { InputGroupButton } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { CheckIcon, CpuIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { isLocalEmbeddingOnlyModel } from '@/features/ai/LocalModelSetupDialog'

import alibabaLogo from '@/assets/model-providers/alibaba.svg'
import googleLogo from '@/assets/model-providers/google.svg'
import huggingfaceLogo from '@/assets/model-providers/huggingface.svg'
import llamaLogo from '@/assets/model-providers/llama.svg'
import mistralLogo from '@/assets/model-providers/mistral.svg'
import moonshotaiLogo from '@/assets/model-providers/moonshotai.svg'
import nvidiaLogo from '@/assets/model-providers/nvidia.svg'
import openaiLogo from '@/assets/model-providers/openai.svg'
import zhipuaiLogo from '@/assets/model-providers/zhipuai.svg'

/** Bundled logos for NoteLab cloud models; other slugs fall back to models.dev */
const MODEL_PROVIDER_LOGO_SRC: Record<string, string> = {
  alibaba: alibabaLogo,
  google: googleLogo,
  huggingface: huggingfaceLogo,
  llama: llamaLogo,
  mistral: mistralLogo,
  moonshotai: moonshotaiLogo,
  nvidia: nvidiaLogo,
  openai: openaiLogo,
  zhipuai: zhipuaiLogo
}

// ---------------------------------------------------------------------------
// Low-level building blocks (kept for potential external use)
// ---------------------------------------------------------------------------

export type ModelSelectorListProps = ComponentProps<typeof CommandList>
export const ModelSelectorList = (props: ModelSelectorListProps) => <CommandList {...props} />

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>
export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => <CommandGroup {...props} />

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>
export const ModelSelectorItem = (props: ModelSelectorItemProps) => <CommandItem {...props} />

export type ModelSelectorSeparatorProps = ComponentProps<typeof CommandSeparator>
export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
)

export type ModelSelectorLogoProps = Omit<ComponentProps<'img'>, 'src' | 'alt'> & {
  provider:
    | 'moonshotai-cn'
    | 'lucidquery'
    | 'moonshotai'
    | 'zai-coding-plan'
    | 'alibaba'
    | 'xai'
    | 'vultr'
    | 'nvidia'
    | 'upstage'
    | 'groq'
    | 'github-copilot'
    | 'mistral'
    | 'vercel'
    | 'nebius'
    | 'deepseek'
    | 'alibaba-cn'
    | 'google-vertex-anthropic'
    | 'venice'
    | 'chutes'
    | 'cortecs'
    | 'github-models'
    | 'togetherai'
    | 'azure'
    | 'baseten'
    | 'huggingface'
    | 'opencode'
    | 'fastrouter'
    | 'google'
    | 'google-vertex'
    | 'cloudflare-workers-ai'
    | 'inception'
    | 'wandb'
    | 'openai'
    | 'zhipuai-coding-plan'
    | 'perplexity'
    | 'openrouter'
    | 'zenmux'
    | 'v0'
    | 'iflowcn'
    | 'synthetic'
    | 'deepinfra'
    | 'zhipuai'
    | 'submodel'
    | 'zai'
    | 'inference'
    | 'requesty'
    | 'morph'
    | 'lmstudio'
    | 'anthropic'
    | 'aihubmix'
    | 'fireworks-ai'
    | 'modelscope'
    | 'llama'
    | 'scaleway'
    | 'amazon-bedrock'
    | 'cerebras'
    | (string & {})
}

export const ModelSelectorLogo = ({ provider, className, ...props }: ModelSelectorLogoProps) => (
  <img
    {...props}
    alt={`${provider} logo`}
    className={cn('size-3 dark:invert', className)}
    height={12}
    src={MODEL_PROVIDER_LOGO_SRC[provider] ?? `https://models.dev/logos/${provider}.svg`}
    width={12}
  />
)

export type ModelSelectorLogoGroupProps = ComponentProps<'div'>
export const ModelSelectorLogoGroup = ({ className, ...props }: ModelSelectorLogoGroupProps) => (
  <div
    className={cn(
      '-space-x-1 flex shrink-0 items-center [&>img]:rounded-full [&>img]:bg-background [&>img]:p-px [&>img]:ring-1 dark:[&>img]:bg-foreground',
      className
    )}
    {...props}
  />
)

export type ModelSelectorNameProps = ComponentProps<'span'>
export const ModelSelectorName = ({ className, ...props }: ModelSelectorNameProps) => (
  <span className={cn('flex-1 truncate text-left', className)} {...props} />
)

// ---------------------------------------------------------------------------
// Notelab model catalogue — mirrors server/src/models.ts
// ---------------------------------------------------------------------------

export type NoteLabModelId =
  | 'glm-4.7-flash'
  | 'kimi-k2.5'
  | 'llama-4-scout-17b'
  | 'gemma-4-26b'
  | 'nemotron-3-120b'
  | 'granite-4.0-micro'
  | 'gpt-oss-120b'
  | 'qwen3-30b'
  | 'mistral-small-3.1'
  | 'llama-3.3-70b-fast'

/** Sentinel prefix for local Ollama models. Full id: "local:<ollama-model-name>" */
export const LOCAL_MODEL_PREFIX = 'local:'

export type NoteLabModel = {
  id: NoteLabModelId
  name: string
  provider: string
  providerSlug: string
  contextWindow: string
  contextWindowTokens: number
}

export const NOTELAB_MODELS: NoteLabModel[] = [
  {
    id: 'glm-4.7-flash',
    name: 'GLM-4.7 Flash',
    provider: 'Zhipu AI',
    providerSlug: 'zhipuai',
    contextWindow: '200K',
    contextWindowTokens: 200_000
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'Moonshot AI',
    providerSlug: 'moonshotai',
    contextWindow: '256K',
    contextWindowTokens: 256_000
  },
  {
    id: 'llama-4-scout-17b',
    name: 'Llama 4 Scout 17B',
    provider: 'Meta',
    providerSlug: 'llama',
    contextWindow: '128K',
    contextWindowTokens: 128_000
  },
  {
    id: 'gemma-4-26b',
    name: 'Gemma 4 26B',
    provider: 'Google',
    providerSlug: 'google',
    contextWindow: '256K',
    contextWindowTokens: 256_000
  },
  {
    id: 'nemotron-3-120b',
    name: 'Nemotron 3 120B',
    provider: 'NVIDIA',
    providerSlug: 'nvidia',
    contextWindow: '1M',
    contextWindowTokens: 1_000_000
  },
  {
    id: 'granite-4.0-micro',
    name: 'Granite 4.0 Micro',
    provider: 'IBM',
    providerSlug: 'huggingface',
    contextWindow: '128K',
    contextWindowTokens: 128_000
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT OSS 120B',
    provider: 'OpenAI',
    providerSlug: 'openai',
    contextWindow: '131K',
    contextWindowTokens: 131_072
  },
  {
    id: 'qwen3-30b',
    name: 'Qwen3 30B',
    provider: 'Qwen',
    providerSlug: 'alibaba',
    contextWindow: '131K',
    contextWindowTokens: 131_072
  },
  {
    id: 'mistral-small-3.1',
    name: 'Mistral Small 3.1',
    provider: 'Mistral AI',
    providerSlug: 'mistral',
    contextWindow: '128K',
    contextWindowTokens: 128_000
  },
  {
    id: 'llama-3.3-70b-fast',
    name: 'Llama 3.3 70B Fast',
    provider: 'Meta',
    providerSlug: 'llama',
    contextWindow: '128K',
    contextWindowTokens: 128_000
  }
]

export const DEFAULT_NOTELAB_MODEL_ID: NoteLabModelId = 'llama-4-scout-17b'

// ---------------------------------------------------------------------------
// NoteLabModelPicker — dropdown trigger shown near prompt input
// ---------------------------------------------------------------------------

export type NoteLabModelPickerProps = {
  /** Either a NoteLabModelId or "local:<modelName>" */
  selectedModelId: string
  onModelChange: (id: string) => void
  /** Local models available from Ollama */
  localModels?: { name: string }[]
  /** Whether Ollama server is running */
  ollamaRunning?: boolean
  /** Called when user clicks "Use local models" button */
  onOpenLocalSetup?: () => void
  /** If true, cloud models are hidden and user must use local */
  localOnly?: boolean
}

export function NoteLabModelPicker({
  selectedModelId,
  onModelChange,
  localModels = [],
  ollamaRunning = false,
  onOpenLocalSetup,
  localOnly = false
}: NoteLabModelPickerProps) {
  const [open, setOpen] = useState(false)

  const localChatModels = useMemo(
    () => localModels.filter((m) => !isLocalEmbeddingOnlyModel(m.name)),
    [localModels]
  )

  const isLocalSelected = selectedModelId.startsWith(LOCAL_MODEL_PREFIX)
  const localModelName = isLocalSelected ? selectedModelId.slice(LOCAL_MODEL_PREFIX.length) : null
  const cloudModel = !isLocalSelected
    ? (NOTELAB_MODELS.find((m) => m.id === selectedModelId) ?? NOTELAB_MODELS[0])
    : null

  const providers = Array.from(new Set(NOTELAB_MODELS.map((m) => m.provider)))

  const displayLabel = isLocalSelected
    ? (localModelName ?? 'Local model')
    : (cloudModel?.name ?? 'Select model')

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          aria-label="Select model"
          className={cn(
            'pointer-events-auto min-w-0 max-w-[min(100%,200px)] shrink-0 px-2 text-xs',
            'font-normal text-muted-foreground hover:text-foreground'
          )}
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{displayLabel}</span>
        </InputGroupButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[260px] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
        side="top"
        sideOffset={6}
      >
        <Command>
          <CommandInput className="h-8 text-xs" placeholder="Search models…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              No models found.
            </CommandEmpty>

            {/* Local models section */}
            {ollamaRunning && localChatModels.length > 0 && (
              <>
                <CommandGroup heading="Local (Ollama)">
                  {localChatModels.map((m) => {
                    const id = `${LOCAL_MODEL_PREFIX}${m.name}`
                    return (
                      <CommandItem
                        key={id}
                        value={id}
                        onSelect={() => {
                          onModelChange(id)
                          setOpen(false)
                        }}
                        className="gap-2 text-xs"
                      >
                        <CpuIcon className="size-3 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{m.name}</span>
                        {selectedModelId === id && <CheckIcon className="ml-1 size-3 shrink-0" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
                {!localOnly && <CommandSeparator />}
              </>
            )}

            {/* Cloud models — hidden if localOnly */}
            {!localOnly &&
              providers.map((provider) => (
                <CommandGroup heading={provider} key={provider}>
                  {NOTELAB_MODELS.filter((m) => m.provider === provider).map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => {
                        onModelChange(model.id)
                        setOpen(false)
                      }}
                      className="gap-2 text-xs"
                    >
                      <ModelSelectorLogo provider={model.providerSlug} />
                      <ModelSelectorName className="text-xs">{model.name}</ModelSelectorName>
                      <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                        {model.contextWindow}
                      </span>
                      {selectedModelId === model.id && (
                        <CheckIcon className="ml-1 size-3 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

            {/* Footer: Use local models button */}
            {onOpenLocalSetup && (
              <>
                <CommandSeparator />
                <div className="p-1.5">
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => {
                      setOpen(false)
                      onOpenLocalSetup()
                    }}
                    type="button"
                  >
                    <CpuIcon className="size-3 shrink-0" />
                    <span>{ollamaRunning ? 'Manage local models' : 'Use local models'}</span>
                    {ollamaRunning && (
                      <span className="ml-auto size-1.5 rounded-full bg-green-500 shrink-0" />
                    )}
                  </button>
                </div>
              </>
            )}
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
