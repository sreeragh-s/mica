import { exists, readDir, rename, watch, type UnwatchFn } from "@tauri-apps/plugin-fs"

export interface DirEntryLite {
  name: string
  isDirectory: boolean
}

export async function readDirectory(path: string): Promise<DirEntryLite[]> {
  const entries = await readDir(path)
  return entries
    .filter((e) => !e.name.startsWith("."))
    .map((e) => ({ name: e.name, isDirectory: e.isDirectory }))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
}

export async function readWorkspaceTree(rootPath: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [rootPath]

  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = await readDir(dir)
    } catch (err) {
      console.error("[fs-adapter] Failed to read directory", dir, err)
      continue
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      const childPath = `${dir}/${entry.name}`
      if (entry.isDirectory) {
        out.push(`${childPath}/`)
        stack.push(childPath)
      } else {
        out.push(childPath)
      }
    }
  }

  return out
}

export async function moveEntry(sourcePath: string, destPath: string): Promise<void> {
  if (await exists(destPath)) {
    throw new Error("A file or folder with the same name already exists in destination")
  }
  await rename(sourcePath, destPath)
}

export function watchDirectory(
  path: string,
  onChange: () => void,
  delayMs = 300
): Promise<UnwatchFn> {
  return watch(path, onChange, { recursive: false, delayMs }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes("Command watch not found")) {
      console.warn(
        "[FileTreeStore] Workspace watch is unavailable in this runtime; continuing without live file-tree watch."
      )
      return () => {}
    }

    throw error
  })
}
