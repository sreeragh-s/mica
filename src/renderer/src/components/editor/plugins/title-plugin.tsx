/**
 * Keeps the TitleNode (first child of root) in sync with the external title
 * prop and fires onTitleChange whenever the user edits it.
 */
import { useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot, $createTextNode, $createParagraphNode } from "lexical"
import { $createTitleNode, $isTitleNode } from "@/components/editor/nodes/title-node"

function $ensureTitleNode() {
  const root = $getRoot()
  const first = root.getFirstChild()
  if ($isTitleNode(first)) return first
  const titleNode = $createTitleNode()
  if (first) {
    first.insertBefore(titleNode)
  } else {
    root.append(titleNode)
    root.append($createParagraphNode())
  }
  return titleNode
}

function $setTitleText(text: string) {
  const titleNode = $ensureTitleNode()
  if (titleNode.getTextContent() === text) return
  titleNode.clear()
  if (text) {
    titleNode.append($createTextNode(text))
  }
}

export function TitlePlugin({
  title,
  onTitleChange,
}: {
  title?: string
  onTitleChange?: (title: string) => void
}) {
  const [editor] = useLexicalComposerContext()
  // Track whether the last title change came from the editor (to avoid loops)
  const internalUpdateRef = useRef(false)

  // Ensure TitleNode exists and initialize on mount
  useEffect(() => {
    editor.update(() => {
      $setTitleText(title ?? "")
    })
    // Only run on mount/note-switch (when title identity changes from outside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, title])

  // Listen for editor changes and fire onTitleChange
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements }) => {
      if (dirtyElements.size === 0) return
      if (internalUpdateRef.current) return
      editorState.read(() => {
        const root = $getRoot()
        const first = root.getFirstChild()
        const text = $isTitleNode(first) ? first.getTextContent() : ""
        onTitleChange?.(text)
      })
    })
  }, [editor, onTitleChange])

  return null
}
