import { createHeadlessEditor } from "@lexical/headless"
import {
  $convertToMarkdownString,
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown"
import type { SerializedEditorState } from "lexical"

import { nodes } from "@/components/editor/nodes/nodes"
import { editorTheme } from "@/components/editor/themes/editor-theme"
import { HR } from "@/components/editor/transformers/markdown-hr-transformer"
import { IMAGE } from "@/components/editor/transformers/markdown-image-transformer"
import { TABLE } from "@/components/editor/transformers/markdown-table-transformer"
import { TWEET } from "@/components/editor/transformers/markdown-tweet-transformer"

import { extractPreviewText } from "@/lib/notes/notes-storage"

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
 * Converts a saved Lexical JSON document to Markdown using the same transformers
 * as the main editor (headless, no DOM).
 */
export function serializedStateToMarkdown(
  serialized: SerializedEditorState | null
): string {
  if (!serialized) {
    return ""
  }
  try {
    const editor = createHeadlessEditor({
      namespace: "markdown-export",
      nodes: [...nodes],
      theme: editorTheme,
      onError: (e) => {
        console.error("[lexical-to-markdown]", e)
      },
    })
    const state = editor.parseEditorState(JSON.stringify(serialized))
    editor.setEditorState(state)
    let md = ""
    editor.getEditorState().read(() => {
      md = $convertToMarkdownString(
        MARKDOWN_TRANSFORMERS,
        undefined,
        true
      )
    })
    return md
  } catch (e) {
    console.error("[lexical-to-markdown] export failed", e)
    try {
      return extractPreviewText(serialized, 10_000)
    } catch {
      return ""
    }
  }
}
