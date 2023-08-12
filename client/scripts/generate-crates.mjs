// Generate crates for Rust Analyzer.

import path from "path";
import fs from "fs/promises";
import { homedir } from "os";
import { execSync, spawnSync } from "child_process";

/** Repository root directory path */
const REPO_ROOT_PATH = path.join("..", "..");

/** Crates output directory path */
const CRATES_PATH = path.join(REPO_ROOT_PATH, "client", "public", "crates");

/** Path to the `Cargo.lock` */
const LOCK_FILE_PATH = path.join(
  REPO_ROOT_PATH,
  "server",
  "solpg",
  "Cargo.lock"
);

/** `syn-file-expand-cli` name */
const CLI_NAME = "syn-file-expand-cli";

// Install `syn-file-expand-cli` if it's not installed
try {
  execSync(`${CLI_NAME} --help`, { stdio: "ignore" });
} catch {
  spawnSync("cargo", ["install", CLI_NAME, "--version", "0.3.0", "--locked"]);
}

/** Whether the `Cargo.lock` file exists */
const hasLockFile = await exists(LOCK_FILE_PATH);

/** `Cargo.lock` file for dependencies */
const lockFile = await parseLockFile(LOCK_FILE_PATH);

/** Local crates.io registry */
const registry = await getRegistry();

/** All supported crates */
const crates = JSON.parse(
  await fs.readFile(path.join(REPO_ROOT_PATH, "supported-crates.json"))
);

/** Cached crate names */
const cachedCrates = [];

await withReset(() => generateDependencies(crates));

/**
 * Execute the given callback after crates directory has been reset.
 *
 * @param {() => Promise<void>} cb callback to execute
 */
async function withReset(cb) {
  const paths = ["alloc", "core", "std"].map((name) => ({
    initial: path.join(CRATES_PATH, `${name}.rs`),
    temp: path.join(CRATES_PATH, "..", `${name}.rs`),
  }));

  // Move default crates
  for (const { initial, temp } of paths) {
    try {
      await fs.rename(initial, temp);
    } catch {}
  }

  // Reset crates directory
  const cratesDirExists = await exists(CRATES_PATH);
  if (cratesDirExists) await fs.rm(CRATES_PATH, { recursive: true });
  await fs.mkdir(CRATES_PATH);

  // Execute callback
  await cb();

  // Move back default crates
  for (const { initial, temp } of paths) {
    try {
      await fs.rename(temp, initial);
    } catch {}
  }
}

/**
 * Generate dependencies recursively.
 *
 * NOTE: Currently only proc macro transitive dependencies are supported.
 *
 * @param {{ [name: string]: string }} crates crates map to get dependencies from
 * @param {boolean} transitive  whether the dependency is a transitive dependency
 */
async function generateDependencies(crates, transitive) {
  for (const name in crates) {
    if (cachedCrates.includes(name)) continue;

    const version = crates[name];
    const dirName = registry.crates.find(
      (crate) => crate === `${name}-${version}`
    );
    if (!dirName) {
      console.log(`Crate \`${name}(v${version})\` not found. Skipping...`);
      continue;
    }

    const dirPath = path.join(registry.path, dirName);

    // Get transitive deps
    if (transitive) {
      // Only get proc macro transitive deps for now
      const cargoToml = await fs.readFile(path.join(dirPath, "Cargo.toml"));
      if (!cargoToml.includes("proc-macro = true")) continue;
    }

    // Generate crate
    const snakeCaseName = name.replaceAll("-", "_");
    const result = spawnSync(CLI_NAME, [
      path.join(dirPath, "src", "lib.rs"),
      "--loopify",
      "--cfg-true-by-default",
      "--output",
      path.join(CRATES_PATH, `${snakeCaseName}.rs`),
    ]);
    if (result.status !== 0) throw new Error(result.stderr.toString());

    // Get `Cargo.toml`
    await fs.copyFile(
      path.join(dirPath, "Cargo.toml.orig"),
      path.join(CRATES_PATH, `${snakeCaseName}.toml`)
    );

    // Cache crate
    cachedCrates.push(name);
    console.log({ name, version });

    // Generate transitive dependencies
    await generateDependencies(getDependencies(name, version), true);
  }
}

/**
 * Get dependencies from the lock file.
 *
 * @param {string} name name of the dependency
 * @param {string} version version of the dependency
 * @returns the dependencies in { [name: string]: <VERSION: string> } format
 */
function getDependencies(name, version) {
  if (!hasLockFile) return {};

  const crate = lockFile.find(
    (crate) => crate.name === name && crate.version === version
  );
  if (!crate) {
    throw new Error(`Crate \`${name}(v${version})\` not found in lock file`);
  }

  return crate.dependencies.reduce((acc, name) => {
    const dep = lockFile.find((crate) => crate.name === name);
    if (dep) acc[name] = dep.version;
    return acc;
  }, {});
}

/**
 * Parse a `Cargo.lock` file.
 *
 * @param {string} lockPath `Cargo.lock` file path
 * @returns the parsed lock file
 */
async function parseLockFile(lockPath) {
  if (!hasLockFile) return [];

  const lockFile = await fs.readFile(lockPath, "utf8");
  return lockFile
    .split("[[package]]")
    .filter((_, i) => i !== 0)
    .map((pkg) => pkg.replaceAll("\n", ""))
    .map((pkg) => {
      const name = /name\s=\s"([\w-]+)"/.exec(pkg)[1];
      const version = /version\s=\s"([\w\d-\.\+]+)"/.exec(pkg)[1];
      const dependencies = JSON.parse(
        /dependencies\s=\s(.*)/.exec(pkg)?.[1].replace(",]", "]") ?? "[]"
      );
      return { name, version, dependencies };
    });
}

/**
 * Get the local crates.io registry data.
 *
 * @returns the registry path and crates
 */
async function getRegistry() {
  const registryPath = path.join(homedir(), ".cargo", "registry", "src");
  const registries = await fs.readdir(registryPath);
  const cratesIoRegistry = registries.find((registry) => {
    return registry.startsWith("index.crates.io");
  });
  if (!cratesIoRegistry) throw new Error("crates.io registry not found");

  const cratesIoRegistryPath = path.join(registryPath, cratesIoRegistry);
  const registryCrates = await fs.readdir(cratesIoRegistryPath);

  return { path: cratesIoRegistryPath, crates: registryCrates };
}

/**
 * Get whether the given path exists.
 *
 * @param {string} path item path
 * @returns whether the path exists
 */
async function exists(path) {
  return !!(await fs.stat(path).catch(() => false));
}
