/**
 * Prepare release folder with macOS artifacts.
 *
 * 1. Creates a versioned folder under releases/.
 * 2. Copies .dmg (Intel) and .zip (Apple Silicon) into it.
 * 3. Extracts the .zip so users can drag the app into Applications.
 *
 * Usage:
 *   node scripts/prepare-release-folder.mjs <version>
 *
 * Example:
 *   node scripts/prepare-release-folder.mjs 1.0.3
 *
 * Output:
 *   releases/
 *   └── 1.0.3/
 *       ├── notelab.io-1.0.3.dmg
 *       ├── notelab.io-1.0.3-arm64-mac/
 *       │   └── notelab.io.app  (extracted)
 *       └── readme.txt
 */

import { copyFileSync, mkdirSync, readdirSync, createWriteStream } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = join(ROOT, "dist");
const RELEASES_DIR = join(ROOT, "releases");

const [, , rawVersion] = process.argv;
const version = rawVersion?.trim();

if (!version) {
	console.error("Usage: node scripts/prepare-release-folder.mjs <version>");
	process.exit(1);
}

function log(...args) {
	console.log(`[prepare-release-folder]`, ...args);
}

function findArtifact(pattern) {
	const files = readdirSync(DIST_DIR).filter((f) => pattern.test(f));
	if (files.length === 0) return null;
	// Sort by modification time, newest first
	files.sort((a, b) => {
		const { mtimeMs: aMs } = require("fs").statSync(join(DIST_DIR, a));
		const { mtimeMs: bMs } = require("fs").statSync(join(DIST_DIR, b));
		return bMs - aMs;
	});
	return files[0];
}

function main() {
	const dmgFile = findArtifact(new RegExp(`^notelab\\.io-${version}\\.dmg$`));
	const zipFile = findArtifact(new RegExp(`^notelab\\.io-${version}-arm64-mac\\.zip$`));

	if (!dmgFile && !zipFile) {
		console.error(`No artifacts found for version ${version}`);
		process.exit(1);
	}

	const versionDir = join(RELEASES_DIR, version);
	mkdirSync(versionDir, { recursive: true });
	log(`Created folder: ${versionDir}`);

	if (dmgFile) {
		const dest = join(versionDir, dmgFile);
		copyFileSync(join(DIST_DIR, dmgFile), dest);
		log(`Copied: ${dmgFile} → ${versionDir}/`);
	}

	if (zipFile) {
		const dest = join(versionDir, zipFile);
		copyFileSync(join(DIST_DIR, zipFile), dest);
		log(`Copied: ${zipFile} → ${versionDir}/`);

		log(`Extracting ${zipFile}...`);
		execSync(`cd "${versionDir}" && unzip -o "${zipFile}"`, { stdio: "inherit" });
		log(`Extraction complete.`);
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

	log(`Done. Release folder: ${versionDir}`);
}

main();
