"use client"

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { JSX, useEffect } from "react"
import { $isLinkNode, LinkNode } from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LinkPlugin as LexicalLinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { $getNodeByKey } from "lexical"

import { useNotelabEditorContext } from "@/components/editor/notelab-editor-context"
import { resolveObsidianInternalLinkTarget } from "@/components/editor/obsidian-link-utils"
import { validateUrl } from "@/components/editor/utils/url"
import { buildInternalNoteLinkHref } from "@/lib/notes/internal-note-link"

export function LinkPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext()
  const ctx = useNotelabEditorContext()

  useEffect(() => {
    if (!ctx) return

    return editor.registerMutationListener(LinkNode, (mutations) => {
      editor.update(() => {
        for (const [nodeKey, mutation] of mutations) {
          if (mutation === "destroyed") continue
          const node = $getNodeByKey(nodeKey)
          if (!$isLinkNode(node)) continue

          const resolved = resolveObsidianInternalLinkTarget(ctx, node.getURL())
          if (!resolved) continue

          const nextUrl = buildInternalNoteLinkHref(
            resolved.notePath,
            resolved.subpath
          )
          if (node.getURL() !== nextUrl) {
            node.setURL(nextUrl)
          }
        }
      })
    })
  }, [ctx, editor])

  return <LexicalLinkPlugin validateUrl={validateUrl} />
}
