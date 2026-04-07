/**
 * Manual upload script for macOS artifacts to Cloudflare R2.
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
 * Required env vars (via .env or inline):
 *   TOKEN     — Cloudflare API token.
 *   ACCESS_KEY — R2 access key ID.
 *   SECRET    — R2 secret access key.
 */

import { createReadStream, statSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
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

const DIST_DIR = join(ROOT, "dist");
const R2_BUCKET = "notelab-app-builds";
const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://232fa4785d5d5a8e779de21f141d5b34.r2.cloudflarestorage.com";
const TOKEN = process.env.TOKEN;
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET = process.env.SECRET;

const [, , rawVersion, rawArch] = process.argv;
const version = rawVersion?.trim();
const arch = rawArch?.trim().toLowerCase();

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

function findArtifact(version, arch) {
	const files = readdirSync(DIST_DIR);
	if (arch === "x64") {
		const dmg = files.find((f) => f === `notelab.io-${version}.dmg`);
		if (!dmg) throw new Error(`No x64 .dmg found for version ${version} in ${DIST_DIR}`);
		return { path: join(DIST_DIR, dmg), ext: "dmg", contentType: "application/x-apple-diskimage" };
	}
	if (arch === "arm64") {
		const zip = files.find((f) => f === `notelab.io-${version}-arm64-mac.zip`);
		if (!zip) throw new Error(`No arm64 .zip found for version ${version} in ${DIST_DIR}`);
		return { path: join(DIST_DIR, zip), ext: "zip", contentType: "application/zip" };
	}
	throw new Error(`Unknown arch: ${arch}`);
}

async function uploadToR2(client, filePath, version, arch, contentType) {
	const ext = arch === "arm64" ? "zip" : "dmg";
	const key = `macos/notelab.io-${version}${arch === "arm64" ? "-arm64" : ""}.${ext}`;
	const fileStats = statSync(filePath);

	log(`Uploading ${filePath} → ${R2_ENDPOINT}/${key} (${fileStats.size} bytes)`);

	const command = new PutObjectCommand({
		Bucket: R2_BUCKET,
		Key: key,
		Body: createReadStream(filePath),
		ContentType: contentType,
		Metadata: { version, arch },
	});

	const response = await client.send(command);
	log(`Upload complete [${arch}]: ${key} — ETag: ${response.ETag}`);
}

async function main() {
	if (!version) errorExit("Version argument is required.");
	if (!TOKEN || !ACCESS_KEY || !SECRET) errorExit("TOKEN, ACCESS_KEY, and SECRET must be set in .env");

	const arches = arch && arch !== "both" ? [arch] : ["x64", "arm64"];

	const client = new S3Client({
		endpoint: R2_ENDPOINT,
		region: "auto",
		credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET },
	});

	for (const a of arches) {
		const artifact = findArtifact(version, a);
		await uploadToR2(client, artifact.path, version, a, artifact.contentType);
	}

	log("All uploads complete.");
}

main().catch((err) => {
	console.error(`[upload-mac-artifacts] Fatal: ${err.message}`);
	process.exit(1);
});
