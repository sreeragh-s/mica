import fs from "node:fs";

const packagePath = "package.json";
const packageLockPath = "package-lock.json";
const tauriConfigPath = "src-tauri/tauri.conf.json";
const cargoTomlPath = "src-tauri/Cargo.toml";
const cargoLockPath = "src-tauri/Cargo.lock";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function nextVersion(version) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const [major, minor, patch] = parts;
  if (patch >= 9) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function replaceVersion(path, pattern, replacement) {
  const content = fs.readFileSync(path, "utf8");
  const next = content.replace(pattern, replacement);
  if (next === content) {
    throw new Error(`Could not update version in ${path}`);
  }
  fs.writeFileSync(path, next);
}

const packageJson = readJson(packagePath);
const version = nextVersion(packageJson.version);

packageJson.name = "notelab";
packageJson.version = version;
writeJson(packagePath, packageJson);

const packageLock = readJson(packageLockPath);
packageLock.name = "notelab";
packageLock.version = version;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].name = "notelab";
  packageLock.packages[""].version = version;
}
writeJson(packageLockPath, packageLock);

const tauriConfig = readJson(tauriConfigPath);
tauriConfig.productName = "notelab";
tauriConfig.version = version;
writeJson(tauriConfigPath, tauriConfig);

replaceVersion(
  cargoTomlPath,
  /(\[package\]\s+name = "notelab"\s+version = ")[^"]+(")/,
  `$1${version}$2`
);
replaceVersion(
  cargoLockPath,
  /(name = "notelab"\s+version = ")[^"]+(")/,
  `$1${version}$2`
);

console.log(version);
