/**
 * Manual upload script for macOS artifacts to Cloudflare R2 via wrangler.
 *
 * Usage:
 *   node scripts/upload-mac-artifacts.mjs <version> [arch]
 *
 * Arguments:
 *   version  — Full version string, e.g. "1.0.4"
 *   arch     — Optional. "x64", "arm64", or "both" (default: "both")
 *
 * Examples:
 *   node scripts/upload-mac-artifacts.mjs 1.0.4
 *   node scripts/upload-mac-artifacts.mjs 1.0.4 x64
 *   node scripts/upload-mac-artifacts.mjs 1.0.4 arm64
 *
 * Prerequisites:
 *   wrangler must be installed and logged in (`wrangler login` or CLOUDFLARE_API_TOKEN set).
 */

import { readdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = join(ROOT, "dist");
const R2_BUCKET = "notelab-app-builds";

const [, , rawVersion, rawArch] = process.argv;
const version = rawVersion?.trim();
const arch = rawArch?.trim().toLowerCase() ?? "both";

function log(...args) {
  console.log(`[upload-mac-artifacts]`, ...args);
}

function errorExit(msg) {
  console.error(`[upload-mac-artifacts] ERROR: ${msg}`);
  console.error("\nUsage:");
  console.error("  node scripts/upload-mac-artifacts.mjs <version> [arch]");
  console.error("  arch: x64 | arm64 | both  (default: both)");
  process.exit(1);
}

function run(command) {
  log(`Running: ${command}`);
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

function findArtifact(version, arch) {
  const files = readdirSync(DIST_DIR);
  if (arch === "x64") {
    const dmg = files.find((f) => f === `notelab.io-${version}.dmg`);
    if (!dmg) throw new Error(`No x64 .dmg found for version ${version} in ${DIST_DIR}`);
    return { path: join(DIST_DIR, dmg), ext: "dmg" };
  }
  if (arch === "arm64") {
    const zip = files.find((f) => f === `notelab.io-${version}-arm64-mac.zip`);
    if (!zip) throw new Error(`No arm64 .zip found for version ${version} in ${DIST_DIR}`);
    return { path: join(DIST_DIR, zip), ext: "zip" };
  }
  throw new Error(`Unknown arch: ${arch}`);
}

function uploadToR2(filePath, version, arch) {
  const ext = arch === "arm64" ? "zip" : "dmg";
  const key = `macos/notelab.io-${version}${arch === "arm64" ? "-arm64" : ""}.${ext}`;
  log(`Uploading [${arch}] ${filePath} → r2://${R2_BUCKET}/${key}`);
  run(`wrangler r2 object put "${R2_BUCKET}/${key}" --file "${filePath}" --remote`);
  log(`Upload complete [${arch}]: ${key}`);
}

async function main() {
  if (!version) errorExit("Version argument is required.");

  const arches = arch === "both" ? ["x64", "arm64"] : [arch];

  for (const a of arches) {
    const artifact = findArtifact(version, a);
    uploadToR2(artifact.path, version, a);
  }

  log("All uploads complete.");
}

main().catch((err) => {
  console.error(`[upload-mac-artifacts] Fatal: ${err.message}`);
  process.exit(1);
});
