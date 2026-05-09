#!/usr/bin/env node
import { parseArgs } from "node:util"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join, resolve, basename } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(fileURLToPath(import.meta.url), "../..")
const tauriDir = join(repoRoot, "src-tauri")

const TARGETS = [
  { triple: "aarch64-apple-darwin", dirName: "arm64" },
  { triple: "x86_64-apple-darwin", dirName: "x86_64" },
]

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`)
  return execFileSync(cmd, args, { stdio: "inherit", cwd: repoRoot, ...opts })
}

function bumpSemver(version, kind) {
  const [maj, min, pat] = version.split(".").map((n) => parseInt(n, 10))
  if ([maj, min, pat].some(Number.isNaN)) {
    throw new Error(`Cannot parse version "${version}" — expected semver MAJOR.MINOR.PATCH`)
  }
  if (kind === "major") return `${maj + 1}.0.0`
  if (kind === "minor") return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

function writeVersionToCargoToml(path, version) {
  const text = readFileSync(path, "utf8")
  const updated = text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`)
  if (updated === text) {
    throw new Error(`Could not find a top-level version field in ${path}`)
  }
  writeFileSync(path, updated)
}

function getGitHubRepo() {
  let remote
  try {
    remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot }).toString().trim()
  } catch {
    throw new Error("Could not read `git remote get-url origin`. Set an origin remote pointing at the GitHub repo before releasing.")
  }
  const match =
    remote.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/) ??
    null
  if (!match?.groups) {
    throw new Error(`Could not parse GitHub owner/repo from remote: ${remote}`)
  }
  return { owner: match.groups.owner, repo: match.groups.repo }
}

function assertSigningEnv() {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY || !process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    throw new Error(
      "TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD must be set in the environment.\n" +
      "See docs/RELEASE.md for one-time signing setup."
    )
  }
}

function ensureRustTarget(triple) {
  try {
    run("rustup", ["target", "add", triple])
  } catch (e) {
    throw new Error(`Failed to ensure Rust target ${triple}. Is rustup installed?\n${e.message}`)
  }
}

function findFirst(dir, predicate) {
  if (!existsSync(dir)) return null
  for (const name of readdirSync(dir)) {
    if (predicate(name)) return join(dir, name)
  }
  return null
}

function collectArtifacts(triple) {
  const bundleDir = join(tauriDir, "target", triple, "release", "bundle")
  const dmg = findFirst(join(bundleDir, "dmg"), (n) => n.endsWith(".dmg"))
  const tarGz = findFirst(join(bundleDir, "macos"), (n) => n.endsWith(".app.tar.gz"))
  const sig = findFirst(join(bundleDir, "macos"), (n) => n.endsWith(".app.tar.gz.sig"))
  if (!dmg) throw new Error(`Missing .dmg under ${bundleDir}/dmg/`)
  if (!tarGz) throw new Error(`Missing .app.tar.gz under ${bundleDir}/macos/ — is the updater plugin configured?`)
  if (!sig) throw new Error(`Missing .app.tar.gz.sig under ${bundleDir}/macos/ — is TAURI_SIGNING_PRIVATE_KEY set?`)
  return { dmg, tarGz, sig }
}

function main() {
  const { values } = parseArgs({
    options: {
      minor: { type: "boolean", default: false },
      major: { type: "boolean", default: false },
      "no-publish": { type: "boolean", default: false },
    },
  })
  const bumpKind = values.major ? "major" : values.minor ? "minor" : "patch"
  const shouldPublish = !values["no-publish"]

  // 1. Validate environment up front so a missing key doesn't leave a half-bumped tree.
  assertSigningEnv()
  const { owner, repo } = getGitHubRepo()
  console.log(`Release will reference https://github.com/${owner}/${repo}/releases/...`)

  // 2. Bump version across the three sources of truth.
  const pkgPath = join(repoRoot, "package.json")
  const tauriConfPath = join(tauriDir, "tauri.conf.json")
  const cargoTomlPath = join(tauriDir, "Cargo.toml")

  const pkg = readJson(pkgPath)
  const oldVersion = pkg.version
  const newVersion = bumpSemver(oldVersion, bumpKind)
  console.log(`Bumping ${bumpKind}: ${oldVersion} → ${newVersion}`)

  pkg.version = newVersion
  writeJson(pkgPath, pkg)

  const tauriConf = readJson(tauriConfPath)
  tauriConf.version = newVersion
  writeJson(tauriConfPath, tauriConf)

  writeVersionToCargoToml(cargoTomlPath, newVersion)

  // 3. Build both targets.
  for (const { triple } of TARGETS) {
    ensureRustTarget(triple)
    run("npm", ["exec", "--", "tauri", "build", "--target", triple])
  }

  // 4. Stage artifacts under dist/releases/<version>/{arm64,x86_64}/.
  const versionDir = join(repoRoot, "dist", "releases", newVersion)
  if (existsSync(versionDir)) rmSync(versionDir, { recursive: true, force: true })
  mkdirSync(versionDir, { recursive: true })

  const platforms = {}
  for (const { triple, dirName } of TARGETS) {
    const targetDir = join(versionDir, dirName)
    mkdirSync(targetDir, { recursive: true })
    const { dmg, tarGz, sig } = collectArtifacts(triple)

    // GitHub release assets must have unique names. Tauri's tarball/sig don't
    // include the arch, so rename them per-target before staging + uploading.
    const tarGzName = `notelab-tauri_${newVersion}_${dirName}.app.tar.gz`
    const sigName = `${tarGzName}.sig`
    copyFileSync(dmg, join(targetDir, basename(dmg)))
    copyFileSync(tarGz, join(targetDir, tarGzName))
    copyFileSync(sig, join(targetDir, sigName))

    const platformKey = triple === "aarch64-apple-darwin" ? "darwin-aarch64" : "darwin-x86_64"
    platforms[platformKey] = {
      signature: readFileSync(sig, "utf8").trim(),
      url: `https://github.com/${owner}/${repo}/releases/download/v${newVersion}/${tarGzName}`,
    }
  }

  // 5. Generate latest.json (Tauri v2 format) for the GitHub Release.
  const manifest = {
    version: newVersion,
    notes: `Release v${newVersion}`,
    pub_date: new Date().toISOString(),
    platforms,
  }
  const manifestPath = join(versionDir, "latest.json")
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")

  // 6. Stage the install script alongside the release artifacts so it's
  //    available at https://github.com/<repo>/releases/latest/download/install.sh
  const installScriptSrc = join(repoRoot, "scripts", "install.sh")
  const installScriptDst = join(versionDir, "install.sh")
  copyFileSync(installScriptSrc, installScriptDst)

  // 7. Write release notes that lead with the one-liner installer and include
  //    a manual fallback for users who prefer not to pipe curl into bash.
  const notesPath = join(versionDir, "RELEASE_NOTES.md")
  const releaseNotes = [
    `## NoteLab v${newVersion}`,
    ``,
    `### Install on macOS (recommended)`,
    ``,
    `One-liner — handles download, /Applications copy, and Gatekeeper unblock automatically:`,
    ``,
    `\`\`\`sh`,
    `curl -fsSL https://github.com/${owner}/${repo}/releases/latest/download/install.sh | bash`,
    `\`\`\``,
    ``,
    `### Manual install`,
    ``,
    `1. Download the DMG for your Mac:`,
    `   - Apple Silicon: \`notelab-tauri_${newVersion}_aarch64.dmg\``,
    `   - Intel: \`notelab-tauri_${newVersion}_x64.dmg\``,
    `2. Open the DMG and drag the app into \`/Applications\`.`,
    `3. macOS will say the app is "damaged" because we don't notarize. Run this once in Terminal to allow it:`,
    ``,
    `   \`\`\``,
    `   xattr -cr /Applications/notelab-tauri.app`,
    `   \`\`\``,
    ``,
    `4. Launch from /Applications. Future updates apply automatically — no need to repeat step 3.`,
    ``,
  ].join("\n")
  writeFileSync(notesPath, releaseNotes)

  // 7. Print the gh release create hint.
  const allFiles = []
  for (const { dirName } of TARGETS) {
    for (const f of readdirSync(join(versionDir, dirName))) {
      allFiles.push(join("dist/releases", newVersion, dirName, f))
    }
  }
  allFiles.push(join("dist/releases", newVersion, "latest.json"))
  allFiles.push(join("dist/releases", newVersion, "install.sh"))

  console.log(`\n✓ Built v${newVersion}. Artifacts in dist/releases/${newVersion}/`)

  if (!shouldPublish) {
    console.log(`\nSkipping publish (--no-publish). Run these manually when ready:\n`)
    console.log(`  git commit -am "release: v${newVersion}"`)
    console.log(`  git tag v${newVersion}`)
    console.log(`  git push origin HEAD --tags`)
    console.log(`  gh release create v${newVersion} \\`)
    for (const f of allFiles) console.log(`    ${f} \\`)
    console.log(`    --title "v${newVersion}" --notes-file dist/releases/${newVersion}/RELEASE_NOTES.md\n`)
    return
  }

  // 8. Auto-publish: commit version bumps, tag, push, create the GitHub release.
  console.log(`\nPublishing v${newVersion}...`)
  run("git", ["commit", "-am", `release: v${newVersion}`])
  run("git", ["tag", `v${newVersion}`])
  run("git", ["push", "origin", "HEAD", "--tags"])

  const ghArgs = [
    "release", "create", `v${newVersion}`,
    ...allFiles,
    "--title", `v${newVersion}`,
    "--notes-file", join("dist/releases", newVersion, "RELEASE_NOTES.md"),
  ]
  run("gh", ghArgs)

  console.log(`\n✓ Published https://github.com/${owner}/${repo}/releases/tag/v${newVersion}`)
}

try {
  main()
} catch (err) {
  console.error(`\n✗ Release failed: ${err.message}`)
  process.exit(1)
}
