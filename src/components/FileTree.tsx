"use client"

import * as React from "react"
import { remove } from "@tauri-apps/plugin-fs"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import {
  FileTree as PierreFileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react"
import { SidebarQuickActions } from "@/components/sidebar-quick-actions"
import type {
  ContextMenuItem as FileTreeContextMenuItem,
  ContextMenuOpenContext as FileTreeContextMenuOpenContext,
  FileTreeDragAndDropConfig,
  FileTreeDropResult,
  FileTreeIconConfig,
  FileTreeRenameEvent,
  FileTreeRenamingConfig,
} from "@pierre/trees"
import { prepareFileTreeInput } from "@pierre/trees"
import { isSupportedEditorFile } from "@/lib/file-types"
import {
  WorkspacePathStore,
  toAbsolutePath,
  toRelativePath,
} from "@/lib/file-tree/store"

const LUCIDE_SYMBOL_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const CUSTOM_ICON_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="notelab-icon-file" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
  </symbol>
  <symbol id="notelab-icon-file-text" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <path d="M10 9H8"/>
    <path d="M16 13H8"/>
    <path d="M16 17H8"/>
  </symbol>
  <symbol id="notelab-icon-file-code" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <path d="M10 12.5 8 15l2 2.5"/>
    <path d="m14 12.5 2 2.5-2 2.5"/>
  </symbol>
  <symbol id="notelab-icon-file-image" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <circle cx="10" cy="12" r="2"/>
    <path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>
  </symbol>
  <symbol id="notelab-icon-video" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
    <rect x="2" y="6" width="14" height="12" rx="2"/>
  </symbol>
</svg>`

const LUCIDE_FILE = { name: "notelab-icon-file", viewBox: "0 0 24 24" }
const LUCIDE_FILE_TEXT = { name: "notelab-icon-file-text", viewBox: "0 0 24 24" }
const LUCIDE_FILE_CODE = { name: "notelab-icon-file-code", viewBox: "0 0 24 24" }
const LUCIDE_FILE_IMAGE = { name: "notelab-icon-file-image", viewBox: "0 0 24 24" }
const LUCIDE_VIDEO = { name: "notelab-icon-video", viewBox: "0 0 24 24" }

const CODE_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rs", "go", "java",
  "cpp", "cc", "cxx", "c", "h", "hpp",
  "css", "scss", "sass", "less",
  "json", "xml", "yaml", "yml", "toml",
  "sh", "bash", "zsh", "fish",
  "rb", "php", "swift", "kt", "kts",
  "vue", "svelte", "astro",
]

const IMAGE_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico",
  "svg", "avif", "heic", "heif",
]

const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "ogv", "mkv", "avi"]

const byFileExtension: Record<string, { name: string; viewBox: string }> = {
  md: LUCIDE_FILE_TEXT,
  markdown: LUCIDE_FILE_TEXT,
  txt: LUCIDE_FILE_TEXT,
  excalidraw: LUCIDE_FILE_CODE,
  "excalidraw.json": LUCIDE_FILE_CODE,
  codedrawing: LUCIDE_FILE_CODE,
  "codedrawing.json": LUCIDE_FILE_CODE,
  pdf: LUCIDE_FILE_CODE,
  html: LUCIDE_FILE_CODE,
  htm: LUCIDE_FILE_CODE,
}
for (const ext of CODE_EXTENSIONS) byFileExtension[ext] = LUCIDE_FILE_CODE
for (const ext of IMAGE_EXTENSIONS) byFileExtension[ext] = LUCIDE_FILE_IMAGE
for (const ext of VIDEO_EXTENSIONS) byFileExtension[ext] = LUCIDE_VIDEO

const TREE_ICONS: FileTreeIconConfig = {
  set: "none",
  colored: false,
  spriteSheet: CUSTOM_ICON_SPRITE,
  remap: {
    "file-tree-icon-file": LUCIDE_FILE,
  },
  byFileExtension,
}

const TREE_THEME_STYLE = {
  height: "100%",
  width: "100%",
  "--trees-bg-override": "var(--sidebar)",
  "--trees-fg-override": "var(--sidebar-foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-bg-muted-override": "var(--sidebar-accent)",
  "--trees-accent-override": "var(--sidebar-accent)",
  "--trees-border-color-override": "var(--sidebar-border)",
  "--trees-border-radius-override": "var(--radius-md)",
  "--trees-selected-bg-override": "var(--sidebar-accent)",
  "--trees-selected-fg-override": "var(--sidebar-accent-foreground)",
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-focus-ring-color-override": "transparent",
  "--trees-focus-ring-width-override": "0px",
  "--trees-indent-guide-bg-override": "var(--sidebar-border)",
  "--trees-input-bg-override": "var(--background)",
  "--trees-search-bg-override": "var(--background)",
  "--trees-search-fg-override": "var(--foreground)",
  "--trees-scrollbar-thumb-override": "var(--sidebar-border)",
  "--trees-font-family-override": "var(--font-sans)",
  "--trees-font-size-override": "12px",
} as React.CSSProperties

function basename(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const idx = trimmed.lastIndexOf("/")
  const name = idx >= 0 ? trimmed.slice(idx + 1) : trimmed
  return path.endsWith("/") ? `${name}/` : name
}

function resolveDropDestination(
  sourcePath: string,
  directoryPath: string | null
): string {
  const sourceName = basename(sourcePath)
  if (directoryPath == null) return sourceName
  return `${directoryPath}${sourceName}`
}

type FileTreeModel = ReturnType<typeof useFileTree>["model"]

export const FileTree = React.memo(function FileTree() {
  const storeRef = React.useRef<WorkspacePathStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = new WorkspacePathStore()
  }
  const store = storeRef.current

  React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const workspace = store.getWorkspace()
  const paths = store.getPaths()
  const isLoading = store.isLoading()

  const preparedInput = React.useMemo(() => prepareFileTreeInput(paths), [paths])

  const workspaceRef = React.useRef(workspace)
  workspaceRef.current = workspace
  const storeInstanceRef = React.useRef(store)
  storeInstanceRef.current = store
  const modelRef = React.useRef<FileTreeModel | null>(null)

  const desiredActivePathRef = React.useRef<string | null>(null)
  const lastDispatchedSelectionRef = React.useRef<string | null>(null)

  const applyDesiredSelection = React.useCallback(() => {
    const ws = workspaceRef.current
    const model = modelRef.current
    if (!ws || !model) return
    const abs = desiredActivePathRef.current
    const rel = abs ? toRelativePath(abs, ws) : null

    const currentSelected = model.getSelectedPaths()
    const targetExists = rel != null && model.getItem(rel) != null

    if (targetExists && rel != null) {
      if (currentSelected.length === 1 && currentSelected[0] === rel) return
      lastDispatchedSelectionRef.current = rel
      for (const p of currentSelected) {
        if (p !== rel) model.getItem(p)?.deselect()
      }
      if (!currentSelected.includes(rel)) {
        model.getItem(rel)?.select()
      }
      return
    }

    if (currentSelected.length > 0) {
      lastDispatchedSelectionRef.current = null
      for (const p of currentSelected) {
        model.getItem(p)?.deselect()
      }
    }
  }, [])

  const dragAndDrop = React.useMemo<FileTreeDragAndDropConfig>(
    () => ({
      onDropComplete: async (event: FileTreeDropResult) => {
        const ws = workspaceRef.current
        const model = modelRef.current
        if (!ws || !model) return
        const destDir = event.target.directoryPath ?? null

        for (const src of event.draggedPaths) {
          const dest = resolveDropDestination(src, destDir)
          if (dest === src) continue
          try {
            await storeInstanceRef.current.moveEntry(src, dest)
            const sourceAbs = toAbsolutePath(src, ws)
            const destAbs = toAbsolutePath(dest, ws)
            const name = basename(dest).replace(/\/$/, "")
            const isDir = src.endsWith("/")
            window.dispatchEvent(
              new CustomEvent("entry-moved", {
                detail: { path: sourceAbs, nextPath: destAbs, name, isDir },
              })
            )
            if (!isDir) {
              window.dispatchEvent(
                new CustomEvent("file-renamed", {
                  detail: { path: sourceAbs, nextPath: destAbs, name },
                })
              )
              if (desiredActivePathRef.current === sourceAbs) {
                desiredActivePathRef.current = destAbs
              }
            }
          } catch (err) {
            console.error("[FileTree] Move failed", err)
            try {
              model.move(dest, src)
            } catch {
              /* model already reverted or path gone */
            }
            globalThis.alert(`Failed to move item: ${err}`)
          }
        }
      },
      onDropError: (error: string) => {
        console.error("[FileTree] Drop error", error)
      },
    }),
    []
  )

  const renaming = React.useMemo<FileTreeRenamingConfig>(
    () => ({
      onRename: async (event: FileTreeRenameEvent) => {
        const ws = workspaceRef.current
        const model = modelRef.current
        if (!ws || !model) return
        const { sourcePath, destinationPath, isFolder } = event
        try {
          await storeInstanceRef.current.moveEntry(sourcePath, destinationPath)
          const sourceAbs = toAbsolutePath(sourcePath, ws)
          const destAbs = toAbsolutePath(destinationPath, ws)
          const name = basename(destinationPath).replace(/\/$/, "")
          window.dispatchEvent(
            new CustomEvent("entry-moved", {
              detail: { path: sourceAbs, nextPath: destAbs, name, isDir: isFolder },
            })
          )
          if (!isFolder) {
            window.dispatchEvent(
              new CustomEvent("file-renamed", {
                detail: { path: sourceAbs, nextPath: destAbs, name },
              })
            )
            if (desiredActivePathRef.current === sourceAbs) {
              desiredActivePathRef.current = destAbs
            }
          }
        } catch (err) {
          console.error("[FileTree] Rename failed", err)
          try {
            model.move(destinationPath, sourcePath)
          } catch {
            /* ignore */
          }
          globalThis.alert(`Failed to rename: ${err}`)
        }
      },
      onError: (error: string) => {
        globalThis.alert(`Rename error: ${error}`)
      },
    }),
    []
  )

  const { model } = useFileTree({
    preparedInput,
    initialExpansion: "closed",
    dragAndDrop,
    renaming,
    icons: TREE_ICONS,
    search: true,
    fileTreeSearchMode: "expand-matches",
    composition: { contextMenu: { enabled: true, triggerMode: "right-click" } },
  })
  modelRef.current = model

  React.useEffect(() => {
    const expandedBefore: string[] = []
    for (const p of paths) {
      if (!p.endsWith("/")) continue
      const item = model.getItem(p)
      if (item && item.isDirectory() === true) {
        if ((item as { isExpanded(): boolean }).isExpanded()) {
          expandedBefore.push(p)
        }
      }
    }
    model.resetPaths(paths, { initialExpandedPaths: expandedBefore })
    applyDesiredSelection()
  }, [applyDesiredSelection, model, paths])

  React.useEffect(() => {
    const loadFromStorage = () => {
      const stored = localStorage.getItem("workspace")
      void store.setWorkspace(stored)
    }
    loadFromStorage()

    const handleWorkspaceChange = () => loadFromStorage()
    const handleDirectoryRefresh = () => {
      void store.reload()
    }
    const handleEntryDeleted = () => {
      void store.reload()
    }
    const handleFileRenamed = () => {
      void store.reload()
    }

    window.addEventListener("workspace-changed", handleWorkspaceChange)
    window.addEventListener("directory-refresh", handleDirectoryRefresh)
    window.addEventListener("entry-deleted", handleEntryDeleted)
    window.addEventListener("file-renamed", handleFileRenamed)

    return () => {
      window.removeEventListener("workspace-changed", handleWorkspaceChange)
      window.removeEventListener("directory-refresh", handleDirectoryRefresh)
      window.removeEventListener("entry-deleted", handleEntryDeleted)
      window.removeEventListener("file-renamed", handleFileRenamed)
      store.dispose()
    }
  }, [store])

  const selectedPaths = useFileTreeSelection(model)

  React.useEffect(() => {
    const ws = workspaceRef.current
    if (!ws) return
    const rel = selectedPaths[0] ?? null

    if (rel === lastDispatchedSelectionRef.current) return
    lastDispatchedSelectionRef.current = rel

    const abs = rel ? toAbsolutePath(rel, ws) : null
    desiredActivePathRef.current = abs

    window.dispatchEvent(
      new CustomEvent("active-path-changed", { detail: { path: abs } })
    )

    if (!abs || !isSupportedEditorFile(abs)) return
    const detail = { path: abs, name: basename(abs).replace(/\/$/, "") }
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("file-selected", { detail }))
    })
  }, [selectedPaths])

  React.useEffect(() => {
    const handleActiveFileChanged = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string | null }>).detail
      desiredActivePathRef.current = path ?? null
      applyDesiredSelection()
    }
    window.addEventListener("active-file-changed", handleActiveFileChanged)
    return () => {
      window.removeEventListener("active-file-changed", handleActiveFileChanged)
    }
  }, [applyDesiredSelection])

  const renderContextMenu = React.useCallback(
    (item: FileTreeContextMenuItem, context: FileTreeContextMenuOpenContext) =>
      renderTreeContextMenu(item, context, model, store),
    [model, store]
  )

  const [isRootDropOver, setIsRootDropOver] = React.useState(false)

  const handleRootDragOver = React.useCallback((event: React.DragEvent) => {
    if (event.defaultPrevented) return
    const types = event.dataTransfer?.types
    if (!types || !Array.from(types).includes("text/plain")) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    setIsRootDropOver(true)
  }, [])

  const handleRootDragLeave = React.useCallback((event: React.DragEvent) => {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setIsRootDropOver(false)
  }, [])

  const handleRootDrop = React.useCallback(
    async (event: React.DragEvent) => {
      setIsRootDropOver(false)
      if (event.defaultPrevented) return
      const src = event.dataTransfer?.getData("text/plain")
      if (!src) return
      event.preventDefault()

      const ws = workspaceRef.current
      const model = modelRef.current
      if (!ws || !model) return
      if (!model.getItem(src)) return
      const dest = basename(src)
      if (dest === src) return

      try {
        model.move(src, dest)
      } catch (err) {
        console.error("[FileTree] Root move failed in model", err)
        return
      }

      try {
        await storeInstanceRef.current.moveEntry(src, dest)
        const sourceAbs = toAbsolutePath(src, ws)
        const destAbs = toAbsolutePath(dest, ws)
        const name = basename(dest).replace(/\/$/, "")
        const isDir = src.endsWith("/")
        window.dispatchEvent(
          new CustomEvent("entry-moved", {
            detail: { path: sourceAbs, nextPath: destAbs, name, isDir },
          })
        )
        if (!isDir) {
          window.dispatchEvent(
            new CustomEvent("file-renamed", {
              detail: { path: sourceAbs, nextPath: destAbs, name },
            })
          )
          if (desiredActivePathRef.current === sourceAbs) {
            desiredActivePathRef.current = destAbs
          }
        }
      } catch (err) {
        console.error("[FileTree] Root FS move failed", err)
        try {
          model.move(dest, src)
        } catch {
          /* ignore */
        }
        globalThis.alert(`Failed to move item: ${err}`)
      }
    },
    []
  )

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No workspace selected
      </div>
    )
  }

  if (isLoading && paths.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarQuickActions />
      <div
        className={
          "min-h-0 flex-1 rounded-md transition-colors " +
          (isRootDropOver ? "bg-sidebar-accent/40" : "")
        }
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        <PierreFileTree
          model={model}
          renderContextMenu={renderContextMenu}
          style={TREE_THEME_STYLE}
        />
      </div>
    </div>
  )
})

type ContextMenuAction = {
  label: string
  onSelect: () => void
  danger?: boolean
}

function renderTreeContextMenu(
  item: FileTreeContextMenuItem,
  context: FileTreeContextMenuOpenContext,
  model: FileTreeModel,
  store: WorkspacePathStore
): React.ReactNode {
  const workspace = store.getWorkspace()
  if (!workspace) return null

  const absolutePath = toAbsolutePath(item.path, workspace)
  const isDir = item.kind === "directory"
  const name = item.name

  const actions: ContextMenuAction[] = [
    {
      label: "Open",
      onSelect: () => {
        if (isDir) {
          const handle = model.getItem(item.path)
          if (handle && handle.isDirectory() === true) {
            ;(handle as { toggle(): void }).toggle()
          }
        } else if (isSupportedEditorFile(absolutePath)) {
          window.dispatchEvent(
            new CustomEvent("file-selected", {
              detail: { path: absolutePath, name },
            })
          )
        }
      },
    },
    {
      label: "Rename",
      onSelect: () => {
        context.close({ restoreFocus: false })
        model.startRenaming(item.path)
      },
    },
    {
      label: "Copy Name",
      onSelect: () => {
        void navigator.clipboard.writeText(name)
      },
    },
    {
      label: "Copy Path",
      onSelect: () => {
        void navigator.clipboard.writeText(absolutePath)
      },
    },
    {
      label: "Copy Relative Path",
      onSelect: () => {
        void navigator.clipboard.writeText(item.path)
      },
    },
    {
      label: "Delete",
      danger: true,
      onSelect: () => {
        const confirmed = globalThis.confirm(
          `Are you sure you want to delete "${name}"?`
        )
        if (!confirmed) return
        remove(absolutePath, { recursive: true })
          .then(() => {
            window.dispatchEvent(
              new CustomEvent("entry-deleted", {
                detail: { path: absolutePath, isDir },
              })
            )
          })
          .catch((err) => {
            console.error("[FileTree] Failed to delete entry", err)
            globalThis.alert(`Failed to delete: ${err}`)
          })
      },
    },
    {
      label: "Show in Finder",
      onSelect: () => {
        void revealItemInDir(absolutePath)
      },
    },
  ]

  return <ContextMenuList actions={actions} onClose={() => context.close()} />
}

const ContextMenuList = React.memo(function ContextMenuList({
  actions,
  onClose,
}: {
  actions: ContextMenuAction[]
  onClose: () => void
}) {
  return (
    <div
      role="menu"
      className="min-w-[180px] rounded-md border border-sidebar-border bg-popover p-1 text-[13px] shadow-md"
    >
      {actions.map((action) => (
        <button
          type="button"
          key={action.label}
          role="menuitem"
          className={
            "block w-full rounded-sm px-2 py-1 text-left hover:bg-accent hover:text-accent-foreground " +
            (action.danger ? "text-destructive" : "text-popover-foreground")
          }
          onClick={() => {
            action.onSelect()
            onClose()
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
})
