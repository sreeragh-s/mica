/**
 * Production macOS build script.
 *
 * 1. Bumps the patch version in package.json.
 * 2. Runs electron-vite build (picks up .env.production automatically).
 * 3. Runs electron-builder --mac --x64 and --mac --arm64 separately.
 * 4. Prepares a versioned release folder with extracted .app for Apple Silicon.
 * 5. Uploads both .dmg/.zip artifacts to Cloudflare R2 via wrangler.
 *
 * Usage:
 *   npm run build:mac:production
 *
 * Prerequisites:
 *   wrangler must be installed and logged in (`wrangler login` or CLOUDFLARE_API_TOKEN set).
 */

import { copyFileSync, mkdirSync, createWriteStream, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const PKG_JSON = join(ROOT, "package.json");
const DIST_DIR = join(ROOT, "dist");
const RELEASES_DIR = join(ROOT, "releases");
const R2_BUCKET = "notelab-app-builds";

function log(...args) {
  console.log(`[build:mac:production]`, ...args);
}

function run(command, opts = {}) {
  log(`Running: ${command}`);
  execSync(command, { cwd: ROOT, stdio: "inherit", ...opts });
}

function bumpVersion() {
  const pkg = JSON.parse(readFileSync(PKG_JSON, "utf-8"));
  const [major, minor, patch] = pkg.version.split(".").map(Number);
  const newVersion = `${major}.${minor}.${patch + 1}`;
  pkg.version = newVersion;
  writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + "\n");
  log(`Version bumped: ${newVersion}`);
  return newVersion;
}

/**
 * Find an artifact by arch. electron-builder outputs:
 *   x64:   notelab.io-X.Y.Z.dmg
 *   arm64: notelab.io-X.Y.Z-arm64-mac.zip
 */
function findArtifact(version, arch) {
  const files = readdirSync(DIST_DIR);
  if (arch === "x64") {
    const dmg = files.find((f) => f === `notelab.io-${version}.dmg`);
    if (!dmg) throw new Error(`No x64 .dmg found for version ${version}`);
    return join(DIST_DIR, dmg);
  }
  const zip = files.find((f) => f === `notelab.io-${version}-arm64-mac.zip`);
  if (!zip) throw new Error(`No arm64 .zip found for version ${version}`);
  return join(DIST_DIR, zip);
}

function uploadToR2(filePath, version, arch) {
  const ext = arch === "arm64" ? "zip" : "dmg";
  const key = `macos/notelab.io-${version}${arch === "arm64" ? "-arm64" : ""}.${ext}`;
  log(`Uploading [${arch}] ${filePath} → r2://${R2_BUCKET}/${key}`);
  run(`wrangler r2 object put "${R2_BUCKET}/${key}" --file "${filePath}" --remote`);
  log(`Upload complete [${arch}]: ${key}`);
}

function prepareReleaseFolder(version, x64Path, arm64Path) {
  const versionDir = join(RELEASES_DIR, version);
  mkdirSync(versionDir, { recursive: true });
  log(`Created release folder: ${versionDir}`);

  if (x64Path) {
    copyFileSync(x64Path, join(versionDir, `notelab.io-${version}.dmg`));
    log(`Copied Intel DMG to release folder`);
  }

  if (arm64Path) {
    const zipDest = join(versionDir, `notelab.io-${version}-arm64-mac.zip`);
    copyFileSync(arm64Path, zipDest);
    log(`Copied Apple Silicon zip to release folder`);
    execSync(`cd "${versionDir}" && unzip -o "${zipDest}"`, { stdio: "inherit" });
    log(`Extracted .app to release folder`);
  }

  const readme = `notelab.io ${version}
=====================

Intel (macOS 10.14+):
  Double-click  notelab.io-${version}.dmg
  Drag notelab.io into Applications when the volume mounts.

Apple Silicon (macOS 10.14+):
  Double-click  notelab.io-${version}-arm64-mac.zip
  Drag notelab.io into Applications.

Tip: If asked about unidentified developer, go to System Preferences → Security & Privacy → General → click "Open Anyway".
`;
  createWriteStream(join(versionDir, "readme.txt"), "utf-8").write(readme);
  log(`Wrote readme.txt`);
}

async function main() {
  const version = bumpVersion();

  log("Starting electron-vite build (production env)...");
  run("electron-vite build");

  log("Building x64 (Intel) DMG...");
  run("npx electron-builder --mac --x64");

  log("Building arm64 (Apple Silicon) zip...");
  run("npx electron-builder --mac --arm64");

  const x64Path = findArtifact(version, "x64");
  const arm64Path = findArtifact(version, "arm64");

  log(`x64 artifact: ${x64Path}`);
  log(`arm64 artifact: ${arm64Path}`);

  prepareReleaseFolder(version, x64Path, arm64Path);

  uploadToR2(x64Path, version, "x64");
  uploadToR2(arm64Path, version, "arm64");

  log("Done!");
}

main().catch((err) => {
  console.error("[build:mac:production] Fatal:", err);
  process.exit(1);
});
