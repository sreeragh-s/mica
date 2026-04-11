'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { useNotelabEditorContext } from '@/features/editor/notelab-editor-context'
import {
  parseInternalNotePathFromHref,
  parseInternalNoteSubpathFromHref
} from '@/lib/notes/internal-note-link'

/**
 * Intercepts clicks on internal #notelab/note/… links before Lexical's default
 * handler opens them in a new window.
 */
export function InternalNoteLinkClickPlugin(): null {
  const [editor] = useLexicalComposerContext()
  const ctx = useNotelabEditorContext()

  useEffect(() => {
    const onOpen = ctx?.onOpenInternalNote
    if (!onOpen) return

    return editor.registerRootListener((rootElement) => {
      if (!rootElement) return

      const onClickCapture = (e: MouseEvent) => {
        if (e.button !== 0) return
        const t = e.target
        if (!(t instanceof Node)) return
        const anchor = t instanceof Element ? t.closest('a[href]') : null
        if (!anchor) return
        const raw = anchor.getAttribute('href') ?? ''
        const resolved = (anchor as HTMLAnchorElement).href || raw
        const href = resolved || raw
        const id = parseInternalNotePathFromHref(resolved) ?? parseInternalNotePathFromHref(raw)
        if (!id) return
        e.preventDefault()
        e.stopPropagation()
        const subpath = parseInternalNoteSubpathFromHref(href)
        onOpen(id, subpath || undefined)
      }

      rootElement.addEventListener('click', onClickCapture, true)
      return () => {
        rootElement.removeEventListener('click', onClickCapture, true)
      }
    })
  }, [editor, ctx?.onOpenInternalNote])

  return null
}
