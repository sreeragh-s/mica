"use client"

import * as React from "react"
import { remove } from "@tauri-apps/plugin-fs"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { Menu, PredefinedMenuItem } from "@tauri-apps/api/menu"
import { message as messageDialog } from "@tauri-apps/plugin-dialog"
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
import { useSidebarViewStore } from "@/components/sidebar-view"
import { isSupportedEditorFile } from "@/lib/file-types"
import {
  WorkspacePathStore,
  toAbsolutePath,
  toRelativePath,
} from "@/lib/file-tree/store"

const LUCIDE_SYMBOL_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const CUSTOM_ICON_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="mica-icon-file" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
  </symbol>
  <symbol id="mica-icon-file-text" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <path d="M10 9H8"/>
    <path d="M16 13H8"/>
    <path d="M16 17H8"/>
  </symbol>
  <symbol id="mica-icon-file-code" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <path d="M10 12.5 8 15l2 2.5"/>
    <path d="m14 12.5 2 2.5-2 2.5"/>
  </symbol>
  <symbol id="mica-icon-file-image" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <circle cx="10" cy="12" r="2"/>
    <path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>
  </symbol>
  <symbol id="mica-icon-video" viewBox="0 0 24 24" ${LUCIDE_SYMBOL_ATTRS}>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
    <rect x="2" y="6" width="14" height="12" rx="2"/>
  </symbol>
</svg>`

const LUCIDE_FILE = { name: "mica-icon-file", viewBox: "0 0 24 24" }
const LUCIDE_FILE_TEXT = { name: "mica-icon-file-text", viewBox: "0 0 24 24" }
const LUCIDE_FILE_CODE = { name: "mica-icon-file-code", viewBox: "0 0 24 24" }
const LUCIDE_FILE_IMAGE = { name: "mica-icon-file-image", viewBox: "0 0 24 24" }
const LUCIDE_VIDEO = { name: "mica-icon-video", viewBox: "0 0 24 24" }

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

function splitNameAndExtension(name: string): { base: string; ext: string } {
  const isFolder = name.endsWith("/")
  const trimmed = isFolder ? name.slice(0, -1) : name
  const dotIdx = trimmed.lastIndexOf(".")
  if (dotIdx <= 0) {
    return { base: trimmed, ext: isFolder ? "/" : "" }
  }
  return {
    base: trimmed.slice(0, dotIdx),
    ext: trimmed.slice(dotIdx) + (isFolder ? "/" : ""),
  }
}

function resolveAvailableDestination(
  model: FileTreeModel,
  desiredDest: string,
  sourcePath: string
): string {
  if (desiredDest === sourcePath) return desiredDest
  if (!model.getItem(desiredDest)) return desiredDest

  const directoryPath = desiredDest.includes("/")
    ? desiredDest.slice(0, desiredDest.lastIndexOf("/", desiredDest.length - 2) + 1)
    : ""
  const sourceName = basename(desiredDest)
  const { base, ext } = splitNameAndExtension(sourceName)
  let counter = 1
  while (counter < 1000) {
    const candidate = `${directoryPath}${base} ${counter}${ext}`
    if (candidate === sourcePath) return candidate
    if (!model.getItem(candidate)) return candidate
    counter++
  }
  return desiredDest
}

type FileTreeModel = ReturnType<typeof useFileTree>["model"]

export const FileTree = React.memo(function FileTree() {
  const setViewLoading = useSidebarViewStore((state) => state.setViewLoading)
  const setViewError = useSidebarViewStore((state) => state.setViewError)
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

  React.useEffect(() => {
    setViewLoading("explorer", isLoading)
  }, [isLoading, setViewLoading])

  React.useEffect(() => {
    if (workspace) {
      setViewError("explorer", null)
      return
    }
    setViewLoading("explorer", false)
    setViewError("explorer", null)
  }, [workspace, setViewError, setViewLoading])

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
          const sourceAbs = toAbsolutePath(src, ws)
          const destAbs = toAbsolutePath(dest, ws)
          const name = basename(dest).replace(/\/$/, "")
          const sourceName = basename(src).replace(/\/$/, "")
          const isDir = src.endsWith("/")

          if (desiredActivePathRef.current === sourceAbs) {
            desiredActivePathRef.current = destAbs
          }
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
          }

          try {
            await storeInstanceRef.current.moveEntry(src, dest)
          } catch (err) {
            console.error("[FileTree] Move failed", err)
            try {
              model.move(dest, src)
            } catch {
              /* model already reverted or path gone */
            }
            window.dispatchEvent(
              new CustomEvent("entry-moved", {
                detail: { path: destAbs, nextPath: sourceAbs, name: sourceName, isDir },
              })
            )
            if (!isDir) {
              window.dispatchEvent(
                new CustomEvent("file-renamed", {
                  detail: { path: destAbs, nextPath: sourceAbs, name: sourceName },
                })
              )
              if (desiredActivePathRef.current === destAbs) {
                desiredActivePathRef.current = sourceAbs
              }
            }
            void messageDialog(`Failed to move item: ${err}`, { title: "Move failed", kind: "error" })
          }
        }
      },
      onDropError: async (error: string, dropContext) => {
        console.warn("[FileTree] Drop rejected, attempting rename-on-collision", error)
        const ws = workspaceRef.current
        const model = modelRef.current
        if (!ws || !model) return
        const destDir = dropContext.target.directoryPath ?? null

        for (const src of dropContext.draggedPaths) {
          const desiredDest = resolveDropDestination(src, destDir)
          if (desiredDest === src) continue
          const dest = resolveAvailableDestination(model, desiredDest, src)
          if (dest === src) continue
          const sourceAbs = toAbsolutePath(src, ws)
          const destAbs = toAbsolutePath(dest, ws)
          const name = basename(dest).replace(/\/$/, "")
          const isDir = src.endsWith("/")

          if (desiredActivePathRef.current === sourceAbs) {
            desiredActivePathRef.current = destAbs
          }
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
          }

          try {
            await storeInstanceRef.current.moveEntry(src, dest)
            await storeInstanceRef.current.reload()
          } catch (err) {
            console.error("[FileTree] Move-with-rename failed", err)
            void messageDialog(`Failed to move item: ${err}`, { title: "Move failed", kind: "error" })
          }
        }
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
          void messageDialog(`Failed to rename: ${err}`, { title: "Rename failed", kind: "error" })
        }
      },
      onError: (error: string) => {
        void messageDialog(`Rename error: ${error}`, { title: "Rename error", kind: "error" })
      },
    }),
    []
  )

  const contextMenuComposition = React.useMemo(
    () => ({
      enabled: true,
      triggerMode: "right-click" as const,
      onOpen: (
        item: FileTreeContextMenuItem,
        context: FileTreeContextMenuOpenContext
      ) => {
        context.close({ restoreFocus: false })
        const model = modelRef.current
        const store = storeInstanceRef.current
        if (!model || !store) return
        void showNativeContextMenu(item, model, store)
      },
    }),
    []
  )

  const sortComparator = React.useMemo(
    () => (left: { isDirectory: boolean; basename: string; path: string }, right: { isDirectory: boolean; basename: string; path: string }) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1
      }
      if (left.isDirectory) {
        return left.basename.localeCompare(right.basename, undefined, { sensitivity: "base" })
      }
      const store = storeInstanceRef.current
      const lm = store.getMtime(left.path) ?? 0
      const rm = store.getMtime(right.path) ?? 0
      if (lm !== rm) return rm - lm
      return left.basename.localeCompare(right.basename, undefined, { sensitivity: "base" })
    },
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
    composition: { contextMenu: contextMenuComposition },
    sort: sortComparator,
  })
  modelRef.current = model

  React.useEffect(() => {
    const currentModel = modelRef.current
    if (!currentModel) return

    const expandedBefore: string[] = []
    for (const p of paths) {
      if (!p.endsWith("/")) continue
      const item = currentModel.getItem(p)
      if (item && item.isDirectory() === true) {
        if ((item as { isExpanded(): boolean }).isExpanded()) {
          expandedBefore.push(p)
        }
      }
    }
    currentModel.resetPaths(paths, { initialExpandedPaths: expandedBefore })
    applyDesiredSelection()
  }, [applyDesiredSelection, paths])

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

  const isEventOverRow = React.useCallback((event: { nativeEvent: Event }) => {
    const path =
      typeof event.nativeEvent.composedPath === "function"
        ? event.nativeEvent.composedPath()
        : []
    for (const el of path) {
      if (!(el instanceof Element)) continue
      if (
        el.matches?.(
          '[data-type="item"], [data-item-flattened-subitem], [data-file-tree-search-input], [data-file-tree-search-container]'
        )
      ) {
        return true
      }
    }
    return false
  }, [])

  const handleEmptyClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (isEventOverRow(event)) return
      const currentModel = modelRef.current
      if (!currentModel) return
      for (const p of currentModel.getSelectedPaths()) {
        currentModel.getItem(p)?.deselect()
      }
      desiredActivePathRef.current = null
    },
    [isEventOverRow]
  )

  const handleEmptyDragOver = React.useCallback(
    (event: React.DragEvent) => {
      if (isEventOverRow(event)) return
      const types = event.dataTransfer?.types
      if (!types || !Array.from(types).includes("text/plain")) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    },
    [isEventOverRow]
  )

  const handleEmptyDrop = React.useCallback(
    async (event: React.DragEvent) => {
      if (isEventOverRow(event)) return
      event.preventDefault()
      const src = event.dataTransfer?.getData("text/plain")
      if (!src) return

      const ws = workspaceRef.current
      const model = modelRef.current
      if (!ws || !model) return
      if (!model.getItem(src)) return
      const desiredDest = basename(src)
      if (desiredDest === src) return
      const dest = resolveAvailableDestination(model, desiredDest, src)
      if (dest === src) return

      const sourceAbs = toAbsolutePath(src, ws)
      const destAbs = toAbsolutePath(dest, ws)
      const name = basename(dest).replace(/\/$/, "")
      const sourceName = basename(src).replace(/\/$/, "")
      const isDir = src.endsWith("/")

      if (desiredActivePathRef.current === sourceAbs) {
        desiredActivePathRef.current = destAbs
      }
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
      }

      try {
        await storeInstanceRef.current.moveEntry(src, dest)
        await storeInstanceRef.current.reload()
      } catch (err) {
        console.error("[FileTree] Root FS move failed", err)
        window.dispatchEvent(
          new CustomEvent("entry-moved", {
            detail: { path: destAbs, nextPath: sourceAbs, name: sourceName, isDir },
          })
        )
        if (!isDir) {
          window.dispatchEvent(
            new CustomEvent("file-renamed", {
              detail: { path: destAbs, nextPath: sourceAbs, name: sourceName },
            })
          )
          if (desiredActivePathRef.current === destAbs) {
            desiredActivePathRef.current = sourceAbs
          }
        }
        void messageDialog(`Failed to move item: ${err}`, { title: "Move failed", kind: "error" })
      }
    },
    [isEventOverRow]
  )

  React.useEffect(() => {
    const handleDeleteRequested = () => {
      const ws = workspaceRef.current
      const model = modelRef.current
      if (!ws || !model) return
      const rel = model.getSelectedPaths()[0]
      if (!rel) return
      const item = model.getItem(rel)
      if (!item) return
      const isDir = item.isDirectory() === true
      const absolutePath = toAbsolutePath(rel, ws)
      const name = basename(rel).replace(/\/$/, "")
      void deleteEntryWithConfirm(absolutePath, name, isDir)
    }
    window.addEventListener("workspace-delete-current", handleDeleteRequested)
    return () => {
      window.removeEventListener("workspace-delete-current", handleDeleteRequested)
    }
  }, [])

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No workspace selected
      </div>
    )
  }

  const workspaceName = workspace ? basename(workspace).replace(/\/$/, "") : ""

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarQuickActions />
      <div className="mx-2 mb-1 truncate px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/60">
        {workspaceName || "Workspace"}
      </div>
      {isLoading ? (
        <div className="px-3 py-1 text-[11px] text-muted-foreground">
          Loading files...
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1"
        onClick={handleEmptyClick}
        onDragOver={handleEmptyDragOver}
        onDrop={handleEmptyDrop}
      >
        {isLoading && paths.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
            Loading files...
          </div>
        ) : (
          <PierreFileTree model={model} style={TREE_THEME_STYLE} />
        )}
      </div>
    </div>
  )
})

async function showNativeContextMenu(
  item: FileTreeContextMenuItem,
  model: FileTreeModel,
  store: WorkspacePathStore
): Promise<void> {
  const workspace = store.getWorkspace()
  if (!workspace) return

  const absolutePath = toAbsolutePath(item.path, workspace)
  const isDir = item.kind === "directory"
  const name = item.name

  const separator = await PredefinedMenuItem.new({ item: "Separator" })

  const menu = await Menu.new({
    items: [
      {
        id: "open",
        text: "Open",
        action: () => {
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
        id: "rename",
        text: "Rename",
        action: () => {
          model.startRenaming(item.path)
        },
      },
      separator,
      {
        id: "copy-name",
        text: "Copy Name",
        action: () => {
          void navigator.clipboard.writeText(name)
        },
      },
      {
        id: "copy-path",
        text: "Copy Path",
        action: () => {
          void navigator.clipboard.writeText(absolutePath)
        },
      },
      {
        id: "copy-relative-path",
        text: "Copy Relative Path",
        action: () => {
          void navigator.clipboard.writeText(item.path)
        },
      },
      separator,
      {
        id: "show-in-finder",
        text: "Show in Finder",
        action: () => {
          void revealItemInDir(absolutePath)
        },
      },
      separator,
      {
        id: "delete",
        text: "Delete",
        action: () => {
          void deleteEntryWithConfirm(absolutePath, name, isDir)
        },
      },
    ],
  })

  await menu.popup()
}

async function deleteEntryWithConfirm(
  absolutePath: string,
  _name: string,
  isDir: boolean
): Promise<void> {
  try {
    await remove(absolutePath, { recursive: true })
    window.dispatchEvent(
      new CustomEvent("entry-deleted", {
        detail: { path: absolutePath, isDir },
      })
    )
  } catch (err) {
    console.error("[FileTree] Failed to delete entry", err)
    await messageDialog(`Failed to delete: ${err}`, { title: "Delete failed", kind: "error" })
  }
}
