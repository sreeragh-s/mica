"use client"

/**
 * When clipboard HTML wraps content in <pre>/<code> (common for copied markdown),
 * Lexical's default rich-text paste imports it as a CodeNode. This plugin detects
 * markdown-shaped plain text and inserts via $convertFromMarkdownString instead.
 */
import { $generateNodesFromSerializedNodes, $insertGeneratedNodes } from "@lexical/clipboard"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { eventFiles } from "@lexical/rich-text"
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  PasteCommandType,
  isDOMNode,
  isSelectionCapturedInDecoratorInput,
  PASTE_COMMAND,
  type SerializedLexicalNode,
} from "lexical"
import { useEffect } from "react"

import { markdownToSerializedState } from "@/lib/editor/markdown-to-serialized"

/**
 * `PASTE_COMMAND` is fired with a ClipboardEvent from the `paste` listener, but also with an
 * `InputEvent` (`beforeinput` / `insertFromPaste`) on Chromium — that path has no `clipboardData`,
 * only `dataTransfer` (same shape for `getData`).
 */
function getPasteDataTransfer(event: Event): DataTransfer | null {
  if (event instanceof ClipboardEvent && event.clipboardData) {
    return event.clipboardData
  }
  const e = event as InputEvent & {
    clipboardData?: DataTransfer | null
    dataTransfer?: DataTransfer | null
  }
  if (e.clipboardData) return e.clipboardData
  if (e.dataTransfer) return e.dataTransfer
  return null
}

/** Plain text: prefer `text/plain`, else strip `text/html` (some stacks omit plain on paste). */
function getClipboardPlainText(dt: DataTransfer): string {
  let plain = dt.getData("text/plain").replace(/^\uFEFF/, "")
  if (plain.trim()) return plain
  const html = dt.getData("text/html")
  if (!html.trim()) return ""
  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    return (doc.body?.textContent ?? "").replace(/^\uFEFF/, "")
  } catch {
    return ""
  }
}

/** Block known code languages so we do not reinterpret source as markdown. */
const CODE_LANG_BLOCKLIST =
  /language-(?:python|py|javascript|js|mjs|cjs|typescript|ts|tsx|jsx|java|kotlin|kt|rust|rs|go|golang|c|cpp|cc|cxx|csharp|cs|php|ruby|rb|swift|scala|shell|bash|sh|zsh|fish|powershell|ps1|sql|json|yaml|yml|toml|xml|html|htm|css|scss|sass|less|dockerfile|graphql|vue|svelte|solidity|objc|matlab|r\b)/i

function looksLikeMarkdownDocument(text: string): boolean {
  if (/(^|\n)#{1,6}\s+\S/m.test(text)) return true
  if (/(^|\n)```/.test(text)) return true
  if (/^\|.+\|\s*$/m.test(text)) return true
  if (/(^|\n)>\s/.test(text)) return true
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true
  if (/\*\*[^*\n]+?\*\*/.test(text)) return true
  const lines = text.split("\n")
  if (lines.filter((l) => /^\s*[-*+]\s+\S/.test(l)).length >= 2) return true
  if (lines.filter((l) => /^\s*\d+\.\s+\S/.test(l)).length >= 2) return true
  return false
}

/**
 * Editors like VS Code / Cursor copy as a styled &lt;div&gt; with
 * `white-space: pre` and no &lt;pre&gt;/&lt;code&gt; — Lexical still turns that into a code block.
 */
function isPreformattedHtmlWrapper(html: string): boolean {
  const h = html.toLowerCase()
  if (h.includes("<pre") || h.includes("<code")) return true
  if (/white-space\s*:\s*pre(?:-wrap|-line)?\b/.test(html)) return true
  return false
}

function shouldPasteMarkdownAsRichText(
  html: string | undefined,
  plain: string
): boolean {
  const text = plain.trim()
  if (!text) return false

  const htmlTrim = html?.trim() ?? ""
  if (CODE_LANG_BLOCKLIST.test(htmlTrim)) return false

  // Prefer rendered markdown whenever the plain text looks like Markdown.
  if (looksLikeMarkdownDocument(text)) return true

  // IDE / browser: HTML is a preformatted wrapper but plain is not “obviously” MD — still parse as MD
  // so we do not end up with one giant CodeNode (Lexical’s default for pre/monospace HTML).
  if (!htmlTrim || htmlTrim === text) return false
  if (!isPreformattedHtmlWrapper(htmlTrim)) return false
  return true
}

export function MarkdownPastePlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: Event) => {
        const [, files, hasTextContent] = eventFiles(event as PasteCommandType)
        if (files.length > 0 && !hasTextContent) return false
        if (
          isDOMNode(event.target) &&
          isSelectionCapturedInDecoratorInput(event.target)
        ) {
          return false
        }

        const data = getPasteDataTransfer(event)
        if (!data) return false

        const lexicalPaste = data.getData("application/x-lexical-editor")
        if (lexicalPaste) {
          try {
            const payload = JSON.parse(lexicalPaste) as { namespace?: string }
            if (payload.namespace === editor._config.namespace) return false
          } catch {
            /* ignore */
          }
        }

        const html = data.getData("text/html")
        const plain = getClipboardPlainText(data)
        if (!shouldPasteMarkdownAsRichText(html, plain)) {
          return false
        }

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const state = markdownToSerializedState(plain)
        if (!state?.root?.children?.length) return false

        event.preventDefault()

        const nodes = $generateNodesFromSerializedNodes(
          state.root.children as SerializedLexicalNode[]
        )
        $insertGeneratedNodes(editor, nodes, selection)
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )
  }, [editor])

  return null
}
