/**
 * List macOS artifact paths from the dist directory.
 *
 * Usage:
 *   node scripts/list-mac-artifacts.mjs [version]
 *
 * Arguments:
 *   version — Optional. Filter by specific version. If omitted, lists all found artifacts.
 *
 * Example:
 *   node scripts/list-mac-artifacts.mjs 1.0.3
 */

import { readdirSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const DIST_DIR = join(ROOT, 'dist')

const [, , rawVersion] = process.argv
const versionFilter = rawVersion?.trim()

const allFiles = readdirSync(DIST_DIR)

const x64Files = allFiles.filter((f) => f.startsWith('notelab.io-') && f.endsWith('.dmg'))
const arm64Files = allFiles.filter(
  (f) => f.startsWith('notelab.io-') && f.endsWith('-arm64-mac.zip')
)

function filterByVersion(files) {
  if (!versionFilter) return files
  return files.filter((f) => f.includes(`-${versionFilter}-`) || f.includes(`-${versionFilter}.`))
}

const x64 = filterByVersion(x64Files)
const arm64 = filterByVersion(arm64Files)

const hasResults = x64.length > 0 || arm64.length > 0

if (!hasResults) {
  console.log(
    `No macOS artifacts found${versionFilter ? ` for version ${versionFilter}` : ''} in ${DIST_DIR}`
  )
  process.exit(0)
}

if (x64.length > 0) {
  console.log('Intel (x64):')
  for (const f of x64) {
    console.log(`  ${join(DIST_DIR, f)}`)
  }
}

if (arm64.length > 0) {
  console.log('Apple Silicon (arm64):')
  for (const f of arm64) {
    console.log(`  ${join(DIST_DIR, f)}`)
  }
}
