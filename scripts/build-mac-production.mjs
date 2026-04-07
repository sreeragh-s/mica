/**
 * Production macOS build script.
 *
 * 1. Bumps the patch version in package.json.
 * 2. Runs electron-vite build.
 * 3. Runs electron-builder --mac --x64 and --mac --arm64 separately.
 * 4. Prepares a versioned release folder with extracted .app for Apple Silicon.
 * 5. Uploads both .dmg/.zip artifacts to Cloudflare R2 via S3-compatible API.
 *
 * Usage:
 *   npm run build:mac:production
 *
 * Required env vars (via .env or inline):
 *   TOKEN     — Cloudflare API token.
 *   ACCESS_KEY — R2 access key ID.
 *   SECRET     — R2 secret access key.
 */

import { copyFileSync, mkdirSync, createWriteStream, createReadStream, statSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ROOT = resolve(import.meta.dirname, "..");

// Load .env file if present
try {
	const envPath = join(ROOT, ".env");
	const envContent = readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
} catch {
	// .env not found, rely on explicitly passed env vars
}

const PKG_JSON = join(ROOT, "package.json");
const DIST_DIR = join(ROOT, "dist");
const RELEASES_DIR = join(ROOT, "releases");
const R2_BUCKET = "notelab-app-builds";
const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://232fa4785d5d5a8e779de21f141d5b34.r2.cloudflarestorage.com";
const TOKEN = process.env.TOKEN;
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET = process.env.SECRET;

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
	const newPatch = patch + 1;
	const newVersion = `${major}.${minor}.${newPatch}`;
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

async function uploadToR2(client, filePath, version, arch) {
	const ext = arch === "arm64" ? "zip" : "dmg";
	const key = `macos/notelab.io-${version}${arch === "arm64" ? "-arm64" : ""}.${ext}`;
	const contentType = arch === "arm64" ? "application/zip" : "application/x-apple-diskimage";
	const fileStats = statSync(filePath);

	log(`Uploading ${filePath} → ${R2_ENDPOINT}/${key} (${fileStats.size} bytes)`);

	const command = new PutObjectCommand({
		Bucket: R2_BUCKET,
		Key: key,
		Body: createReadStream(filePath),
		ContentType: contentType,
		Metadata: { version, arch },
	});

	await client.send(command);
	log(`Upload complete [${arch}]: ${key}`);
}

function prepareReleaseFolder(version, x64Path, arm64Path) {
	const versionDir = join(RELEASES_DIR, version);
	mkdirSync(versionDir, { recursive: true });
	log(`Created release folder: ${versionDir}`);

	if (x64Path) {
		const dmgFile = join(versionDir, `notelab.io-${version}.dmg`);
		copyFileSync(x64Path, dmgFile);
		log(`Copied Intel DMG to release folder`);
	}

	if (arm64Path) {
		const zipFile = join(versionDir, `notelab.io-${version}-arm64-mac.zip`);
		copyFileSync(arm64Path, zipFile);
		log(`Copied Apple Silicon zip to release folder`);

		log(`Extracting Apple Silicon zip...`);
		execSync(`cd "${versionDir}" && unzip -o "${zipFile}"`, { stdio: "inherit" });
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
	if (!TOKEN || !ACCESS_KEY || !SECRET) {
		throw new Error("TOKEN, ACCESS_KEY, and SECRET must be set in .env");
	}

	const version = bumpVersion();

	log("Starting electron-vite build...");
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

	const client = new S3Client({
		endpoint: R2_ENDPOINT,
		region: "auto",
		credentials: {
			accessKeyId: ACCESS_KEY,
			secretAccessKey: SECRET,
		},
	});

	await uploadToR2(client, x64Path, version, "x64");
	await uploadToR2(client, arm64Path, version, "arm64");

	log("Done!");
}

main().catch((err) => {
	console.error("[build:mac:production] Fatal:", err);
	process.exit(1);
});
