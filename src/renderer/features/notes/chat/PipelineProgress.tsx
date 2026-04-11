import { SearchIcon } from 'lucide-react'
import { useMemo } from 'react'

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep
} from '@/features/ai/chain-of-thought'
import type { ChatPipelineStatus } from '@/hooks/useNotesChat'

const seedNoteDescriptions = [
  'Finding relevant notes from your workspace',
  'Locating notes with matching keywords',
  'Searching your note collection',
  'Discovering related notes',
  'Fetching potential matches'
]

const connectedNoteDescriptions = [
  'Expanding through bidirectional links',
  'Following connections between notes',
  'Mapping linked references',
  'Finding connected properties',
  'Traversing note relationships'
]

const finalContextDescriptions = [
  'Curating final context for response',
  'Preparing notes for the model',
  'Compiling context window',
  'Building response context',
  'Assembling relevant notes'
]

function getRandomDescription(descriptions: string[]): string {
  return descriptions[Math.floor(Math.random() * descriptions.length)]
}

interface PipelineProgressProps {
  status: ChatPipelineStatus
  onOpenNote: (notePath: string) => void
  /** When true, the pipeline is still running — collapsible stays open */
  isActive: boolean
}

export function PipelineProgress({ status, onOpenNote, isActive }: PipelineProgressProps) {
  const showSeedNotes =
    status.stage === 'seed-results' ||
    status.stage === 'expanding' ||
    status.stage === 'connected-results' ||
    status.stage === 'reranking' ||
    status.stage === 'context-ready'

  const showConnectedNotes =
    status.stage === 'connected-results' ||
    status.stage === 'reranking' ||
    status.stage === 'context-ready'

  const showFinalNotes = status.stage === 'context-ready'

  const seedDescription = useMemo(() => getRandomDescription(seedNoteDescriptions), [])
  const connectedDescription = useMemo(() => getRandomDescription(connectedNoteDescriptions), [])
  const finalDescription = useMemo(() => getRandomDescription(finalContextDescriptions), [])

  const isLoading =
    status.stage === 'analyzing' ||
    status.stage === 'searching' ||
    status.stage === 'expanding' ||
    status.stage === 'reranking'

  const stageLabel = useMemo(() => {
    switch (status.stage) {
      case 'analyzing':
        return 'Analyzing query…'
      case 'searching':
        return 'Searching notes…'
      case 'seed-results':
        return `Found ${status.seedNotes.length} notes`
      case 'expanding':
        return 'Expanding connections…'
      case 'connected-results':
        return `${status.connectedNotes.length} connected notes found`
      case 'reranking':
        return 'Re-ranking results…'
      case 'context-ready':
        return `Analyzed ${status.finalNotes.length} notes`
    }
  }, [status])

  // Only pass `open` as a controlled prop while the pipeline is running — this
  // forces the collapsible open. Once `isActive` becomes false (response is
  // streaming or done) we drop the controlled prop so the user can freely
  // toggle it open/closed. `defaultOpen` seeds the initial state as collapsed
  // for finished pipelines (they were already open while active).
  const openProps = isActive ? { open: true } : { defaultOpen: false }

  return (
    <ChainOfThought className="mt-2" {...openProps}>
      <ChainOfThoughtHeader icon={SearchIcon} loading={isLoading}>
        {stageLabel}
      </ChainOfThoughtHeader>

      <ChainOfThoughtContent>
        {showSeedNotes && status.seedNotes.length > 0 && (
          <ChainOfThoughtStep
            label={<span className="font-medium">Found {status.seedNotes.length} seed notes</span>}
            description={seedDescription}
            status="complete"
          >
            <ChainOfThoughtSearchResults>
              {status.seedNotes.map((note) => (
                <ChainOfThoughtSearchResult
                  key={`seed-${note.note}`}
                  title={note.title}
                  onClick={() => onOpenNote(note.note)}
                />
              ))}
            </ChainOfThoughtSearchResults>
          </ChainOfThoughtStep>
        )}

        {showConnectedNotes && status.connectedNotes.length > 0 && (
          <ChainOfThoughtStep
            label={
              <span className="font-medium">{status.connectedNotes.length} connected notes</span>
            }
            description={connectedDescription}
            status="complete"
          >
            <ChainOfThoughtSearchResults>
              {status.connectedNotes.map((note) => (
                <ChainOfThoughtSearchResult
                  key={`connected-${note.note}`}
                  title={note.title}
                  onClick={() => onOpenNote(note.note)}
                />
              ))}
            </ChainOfThoughtSearchResults>
          </ChainOfThoughtStep>
        )}

        {showFinalNotes && status.finalNotes.length > 0 && (
          <ChainOfThoughtStep
            label={
              <span className="font-medium">{status.finalNotes.length} notes in context</span>
            }
            description={finalDescription}
            status="complete"
          >
            <ChainOfThoughtSearchResults>
              {status.finalNotes.map((note) =>
                note.source === 'global_fallback' ? (
                  <ChainOfThoughtSearchResult
                    key={`final-${note.note}`}
                    onClick={() => onOpenNote(note.note)}
                  >
                    <span className="font-medium">{note.title}</span>
                    <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      global
                    </span>
                  </ChainOfThoughtSearchResult>
                ) : (
                  <ChainOfThoughtSearchResult
                    key={`final-${note.note}`}
                    title={note.title}
                    onClick={() => onOpenNote(note.note)}
                  />
                )
              )}
            </ChainOfThoughtSearchResults>
          </ChainOfThoughtStep>
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
