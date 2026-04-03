#!/usr/bin/env node
/**
 * Deletes Chromium/Electron on-disk Local Storage for gitnotes (renderer localStorage,
 * including partitioned sessions like persist:gitnotes-auth).
 *
 * Quit the app before running. Paths follow Electron defaults for `package.json` name "gitnotes".
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function userDataRoot() {
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'gitnotes')
    case 'win32':
      return path.join(home, 'AppData', 'Roaming', 'gitnotes')
    default:
      return path.join(home, '.config', 'gitnotes')
  }
}

function rmDir(p) {
  if (!fs.existsSync(p)) return false
  try {
    fs.rmSync(p, { recursive: true, force: true })
    return true
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e)
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      console.error(
        '[clean-local-storage] could not remove (quit gitnotes completely, then retry):',
        p
      )
    } else {
      console.error('[clean-local-storage] failed:', p, err.message)
    }
    return false
  }
}

const root = userDataRoot()
console.log('[clean-local-storage] userData root:', root)

if (!fs.existsSync(root)) {
  console.log('[clean-local-storage] nothing to remove (folder missing).')
  process.exit(0)
}

let removed = 0
const tryRemove = (label, p) => {
  if (rmDir(p)) {
    console.log('[clean-local-storage] removed', label + ':', p)
    removed++
  }
}

tryRemove('default Local Storage', path.join(root, 'Local Storage'))

const partitions = path.join(root, 'Partitions')
if (fs.existsSync(partitions)) {
  for (const name of fs.readdirSync(partitions, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    tryRemove(`partition "${name.name}" Local Storage`, path.join(partitions, name.name, 'Local Storage'))
  }
}

console.log(
  removed > 0
    ? '[clean-local-storage] done. Restart gitnotes.'
    : '[clean-local-storage] no Local Storage dirs found (already clean?).'
)
