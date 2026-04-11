import { createHeadlessEditor } from "@lexical/headless"
import {
  $convertFromMarkdownString,
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown"
import { $getRoot } from "lexical"
import type { SerializedEditorState } from "lexical"

import { nodes } from "@/features/editor/nodes/nodes"
import { editorTheme } from "@/features/editor/themes/editor-theme"
import { HR } from "@/features/editor/transformers/markdown-hr-transformer"
import { IMAGE } from "@/features/editor/transformers/markdown-image-transformer"
import { TABLE } from "@/features/editor/transformers/markdown-table-transformer"
import { TWEET } from "@/features/editor/transformers/markdown-tweet-transformer"
import { stripLeadingTitleHeadingIfMatches } from '@shared/notes/note-markdown'

const MARKDOWN_TRANSFORMERS = [
  TABLE,
  HR,
  IMAGE,
  TWEET,
  CHECK_LIST,
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]

/**
 * Parse Markdown (body only, no front matter) into Lexical JSON using the same
 * transformers as export and the main editor.
 */
export function markdownToSerializedState(
  markdown: string
): SerializedEditorState | null {
  const trimmed = markdown.trim()
  if (!trimmed) return null
  try {
    const editor = createHeadlessEditor({
      namespace: "markdown-import",
      nodes: [...nodes],
      theme: editorTheme,
      onError: (e) => {
        console.error("[markdown-to-serialized]", e)
      },
    })
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        $convertFromMarkdownString(
          trimmed,
          MARKDOWN_TRANSFORMERS,
          undefined,
          true
        )
      },
      { discrete: true }
    )
    return editor.getEditorState().toJSON() as SerializedEditorState
  } catch (e) {
    console.error("[markdown-to-serialized] import failed", e)
    return null
  }
}

export function diskBodyToContent(
  body: string,
  fileTitle: string
): SerializedEditorState | null {
  const withoutLegacyDupTitle = stripLeadingTitleHeadingIfMatches(body, fileTitle)
  const t = withoutLegacyDupTitle.trim()
  if (!t || t === "_Empty note._") return null
  return markdownToSerializedState(t)
}

export function stripSerializedLeadingTitleHeading(
  serialized: SerializedEditorState,
  title: string
): SerializedEditorState {
  const normalizedTitle = title.trim()
  if (!normalizedTitle) return serialized
  const root = serialized.root as {
    children?: Array<Record<string, unknown>>
  }
  const children = Array.isArray(root.children) ? [...root.children] : []
  const first = children[0]
  if (!first || first.type !== "heading" || first.tag !== "h1") {
    return serialized
  }
  const text = walkSerializedHeadingText(first).trim()
  if (text !== normalizedTitle) {
    return serialized
  }
  children.shift()
  return {
    ...serialized,
    root: {
      ...serialized.root,
      children: children as typeof serialized.root.children,
    },
  }
}

function walkSerializedHeadingText(node: unknown): string {
  if (node == null || typeof node !== "object") return ""
  const record = node as Record<string, unknown>
  if (record.type === "text" && typeof record.text === "string") {
    return record.text
  }
  if (Array.isArray(record.children)) {
    return record.children.map(walkSerializedHeadingText).join("")
  }
  return ""
}
