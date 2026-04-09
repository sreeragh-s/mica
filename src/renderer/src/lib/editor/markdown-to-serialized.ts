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

import { nodes } from "@/components/editor/nodes/nodes"
import { editorTheme } from "@/components/editor/themes/editor-theme"
import { HR } from "@/components/editor/transformers/markdown-hr-transformer"
import { IMAGE } from "@/components/editor/transformers/markdown-image-transformer"
import { TABLE } from "@/components/editor/transformers/markdown-table-transformer"
import { TWEET } from "@/components/editor/transformers/markdown-tweet-transformer"

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

export function diskBodyToContent(body: string): SerializedEditorState | null {
  const t = body.trim()
  if (!t || t === "_Empty note._") return null
  return markdownToSerializedState(t)
}
