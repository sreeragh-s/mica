'use client'

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalCommand, LexicalEditor, RangeSelection } from 'lexical'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  REDO_COMMAND,
  UNDO_COMMAND
} from 'lexical'
import { MicIcon } from 'lucide-react'
import { toast } from 'sonner'

import { CAN_USE_DOM } from '@/features/editor/shared/can-use-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const SPEECH_TO_TEXT_COMMAND: LexicalCommand<boolean> =
  createCommand('SPEECH_TO_TEXT_COMMAND')

const VOICE_COMMANDS: Readonly<
  Record<string, (arg0: { editor: LexicalEditor; selection: RangeSelection }) => void>
> = {
  '\n': ({ selection }) => {
    selection.insertParagraph()
  },
  redo: ({ editor }) => {
    editor.dispatchCommand(REDO_COMMAND, undefined)
  },
  undo: ({ editor }) => {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
  }
}

export const SUPPORT_SPEECH_RECOGNITION: boolean =
  CAN_USE_DOM && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

function SpeechToTextPluginImpl() {
  const [editor] = useLexicalComposerContext()
  const [isActive, setIsActive] = useState(false)
  const listeningRef = useRef(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    if (!CAN_USE_DOM) {
      return
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) {
      return
    }

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    recognition.addEventListener('result', (event: SpeechRecognitionEvent) => {
      const resultItem = event.results.item(event.resultIndex)
      const { transcript } = resultItem.item(0)

      if (!resultItem.isFinal) {
        return
      }

      editor.update(() => {
        const selection = $getSelection()

        if ($isRangeSelection(selection)) {
          const command = VOICE_COMMANDS[transcript.toLowerCase().trim()]

          if (command) {
            command({
              editor,
              selection
            })
          } else if (transcript.match(/\s*\n\s*/)) {
            selection.insertParagraph()
          } else {
            selection.insertText(transcript)
          }
        }
      })
    })

    recognition.addEventListener('end', () => {
      if (listeningRef.current) {
        queueMicrotask(() => {
          try {
            recognition.start()
          } catch {
            // Already running or invalid state — ignore
          }
        })
      }
    })

    recognition.addEventListener('error', (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        return
      }
      if (event.error === 'not-allowed') {
        listeningRef.current = false
        setIsActive(false)
        toast.error('Microphone permission is required for speech to text.')
        return
      }
      if (event.error === 'network' || event.error === 'service-not-allowed') {
        toast.error(
          'Speech recognition needs a network connection (browser engine uses a cloud service).'
        )
        listeningRef.current = false
        setIsActive(false)
        return
      }
      console.warn('[speech-to-text]', event.error)
    })

    recognitionRef.current = recognition

    return () => {
      listeningRef.current = false
      recognitionRef.current = null
      recognition.abort()
    }
  }, [editor])

  useEffect(() => {
    return editor.registerCommand(
      SPEECH_TO_TEXT_COMMAND,
      (enabled: boolean) => {
        listeningRef.current = enabled
        setIsActive(enabled)
        const rec = recognitionRef.current
        if (!rec) {
          return true
        }
        try {
          if (enabled) {
            rec.start()
          } else {
            rec.stop()
          }
        } catch {
          listeningRef.current = false
          setIsActive(false)
          toast.error('Could not start speech recognition. Try again.')
        }
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  const toggle = useCallback(() => {
    editor.dispatchCommand(SPEECH_TO_TEXT_COMMAND, !listeningRef.current)
  }, [editor])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={toggle}
          variant={isActive ? 'secondary' : 'ghost'}
          title="Speech To Text"
          aria-label={`${isActive ? 'Disable' : 'Enable'} speech to text`}
          className="p-2"
          size={'sm'}
        >
          <MicIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Speech To Text</TooltipContent>
    </Tooltip>
  )
}

export const SpeechToTextPlugin = SUPPORT_SPEECH_RECOGNITION ? SpeechToTextPluginImpl : () => null
