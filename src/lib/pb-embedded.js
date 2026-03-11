/**
 * pb-embedded.js — Universal embedded PocketBase manager.
 *
 * A single-file, plug-and-play module to download, configure, launch, and manage an embedded PocketBase instance from any Node.js project.
 *
 * ─── Requirements ──────────────────────────────────────────────────────
 *   npm install pocketbase            (only runtime dependency)
 *   npm install dotenv                (optional — for .env file loading)
 *   Node.js >= 18                     (uses native fetch & stream APIs)
 *
 * ─── Env Variables (.env or process.env) ───────────────────────────────
 *   POCKETBASE_ADMIN_EMAIL      *required*  Superuser email
 *   POCKETBASE_ADMIN_PASSWORD   *required*  Superuser password (min 10 chars)
 *   POCKETBASE_PORT             optional   Fixed port for the embedded server.
 *                                          If set, this port is used as-is.
 *                                          If omitted, a random port (8090-8190) is auto-selected and persisted across reboots.
 *                                          The resolved URL is always http://127.0.0.1:<port>.
 *   POCKETBASE_VERSION          optional   Pin a specific version (e.g. 0.25.8)
 *   POCKETBASE_DATA_DIR         optional   Default: ./data/pocketbase
 *   POCKETBASE_SCHEMA           optional   Path to pb_schema.json (native export)
 *   POCKETBASE_DB_SCHEMA        optional   Path to db_schema.json (safe schema)
 *
 * ─── Usage as library ──────────────────────────────────────────────────
 *   import { boot, stop, getClient } from './pb-embedded.js';
 *
 *   const pb = await boot();   // download → provision → start → schema → verify
 *   // ... use pb (authenticated admin client) ...
 *   stop();                    // graceful shutdown
 *
 * ─── Usage as CLI ──────────────────────────────────────────────────────
 *   node pb-embedded.js                  # full boot (keeps running)
 *   node pb-embedded.js build-schema     # convert pb_schema → db_schema
 *   node pb-embedded.js download         # download binary only
 *   node pb-embedded.js apply-schema     # apply db_schema to running PB
 *   node pb-embedded.js test             # health + schema verification
 *
 * ─── Exports ───────────────────────────────────────────────────────────
 *   boot(options?)                Full lifecycle: download → start → schema
 *   stop()                        Stop embedded PocketBase process
 *   getClient()                   Get authenticated PocketBase admin client
 *   ensureBinary(options?)        Download PocketBase binary if missing
 *   provisionSuperuser(options?)  Create/update the admin account
 *   startProcess(options?)        Spawn the PocketBase server process
 *   stopProcess()                 Kill the spawned process
 *   waitForHealth(options?)       Poll /api/health until ready
 *   buildSafeSchema(options?)     Convert pb_schema.json → db_schema.json
 *   applySchema(options?)         Apply db_schema.json collections to PB
 *   verifySetup(options?)         Verify health + schema + admin auth
 *   resolveConfig(overrides?)     Resolve config from env + overrides
 */

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

try {
  await import("dotenv/config");
} catch {}

let PocketBase;
async function loadPocketBase() {
  if (!PocketBase) {
    const mod = await import("pocketbase");
    PocketBase = mod.default || mod;
  }
  return PocketBase;
}

const GITHUB_RELEASES_API = "https://api.github.com/repos/pocketbase/pocketbase/releases/latest";
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const PB_HOST = "127.0.0.1";
const PORT_MIN = 8090;
const PORT_MAX = 8190;
const PORT_FILE_NAME = ".pb_port";

function buildUrl(port) {
  return `http://${PB_HOST}:${port}`;
}

/**
 * Resolves the full configuration from environment variables + overrides.
 * @param {Object} [overrides] - Partial config overrides.
 * @returns {Object} Resolved configuration.
 */
export function resolveConfig(overrides = {}) {
  const e = process.env;
  const rawEnvPort = e.POCKETBASE_PORT && e.POCKETBASE_PORT.trim() !== "" ? parseInt(e.POCKETBASE_PORT.trim(), 10) : null;
  const fixedPort = overrides.port ?? rawEnvPort;
  const config = {
    port: fixedPort,
    customPort: fixedPort !== null && fixedPort !== undefined,
    url: buildUrl(fixedPort || 8090),
    adminEmail: overrides.adminEmail || e.POCKETBASE_ADMIN_EMAIL || "",
    adminPassword: overrides.adminPassword || e.POCKETBASE_ADMIN_PASSWORD || "",
    version: overrides.version || e.POCKETBASE_VERSION || "",
    dataDir: overrides.dataDir || e.POCKETBASE_DATA_DIR || path.resolve(process.cwd(), "data", "pocketbase"),
    pbSchemaPath: overrides.pbSchemaPath || e.POCKETBASE_SCHEMA || path.resolve(process.cwd(), "pb_schema.json"),
    dbSchemaPath: overrides.dbSchemaPath || e.POCKETBASE_DB_SCHEMA || path.resolve(process.cwd(), "db_schema.json"),
    verboseLogs: overrides.verboseLogs ?? String(e.POCKETBASE_VERBOSE_LOGS || "false").toLowerCase() === "true",
    log: overrides.log || console.log,
    warn: overrides.warn || console.warn,
    error: overrides.error || console.error,
  };
  return config;
}

/**
 * Checks whether a TCP port is currently in use.
 * Works cross-platform (Windows, macOS, Linux) using Node's net module.
 * @param {number} port
 * @param {string} [host="127.0.0.1"]
 * @returns {Promise<boolean>} true if the port is in use.
 */
function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, host);
  });
}

/**
 * Returns the path to the port persistence file inside the data directory.
 * @param {string} dataDir
 * @returns {string}
 */
function portFilePath(dataDir) {
  return path.join(dataDir, PORT_FILE_NAME);
}

/**
 * Reads the persisted port from disk.
 * @param {string} dataDir
 * @returns {Promise<number|null>} The port number or null if not persisted.
 */
async function readPersistedPort(dataDir) {
  try {
    const raw = await fs.readFile(portFilePath(dataDir), "utf8");
    const port = parseInt(raw.trim(), 10);
    if (port >= PORT_MIN && port <= PORT_MAX) return port;
  } catch {}
  return null;
}

/**
 * Writes the chosen port to disk so it persists across reboots.
 * @param {string} dataDir
 * @param {number} port
 */
async function persistPort(dataDir, port) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(portFilePath(dataDir), String(port), "utf8");
}

/**
 * Finds an available port in the [PORT_MIN, PORT_MAX] range.
 * If a port was previously persisted and is still free, it is reused.
 * Otherwise a new random port is selected and persisted.
 *
 * @param {Object} config - Resolved config.
 * @returns {Promise<number>} An available port.
 */
async function resolvePort(config) {
  const persisted = await readPersistedPort(config.dataDir);
  if (persisted !== null) {
    const inUse = await isPortInUse(persisted, PB_HOST);
    if (!inUse) {
      config.log(`[pb-embedded] Reusing persisted port ${persisted}`);
      return persisted;
    }
    config.warn(`[pb-embedded] Persisted port ${persisted} is in use, finding a new one...`);
  }

  const candidates = [];
  for (let p = PORT_MIN; p <= PORT_MAX; p++) candidates.push(p);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const port of candidates) {
    const inUse = await isPortInUse(port, PB_HOST);
    if (!inUse) {
      await persistPort(config.dataDir, port);
      config.log(`[pb-embedded] Selected available port ${port}`);
      return port;
    }
  }

  throw new Error(`No available port found in range ${PORT_MIN}-${PORT_MAX}.`);
}

function requireCredentials(config) {
  if (!config.adminEmail) {
    throw new Error("Missing POCKETBASE_ADMIN_EMAIL. Set it in .env or pass { adminEmail } to boot().");
  }
  if (!config.adminPassword) {
    throw new Error("Missing POCKETBASE_ADMIN_PASSWORD. Set it in .env or pass { adminPassword } to boot().");
  }
}

function binaryPath(dataDir) {
  return path.join(dataDir, process.platform === "win32" ? "pocketbase.exe" : "pocketbase");
}

function getPlatformAssetName(version) {
  const platformMap = { win32: "windows", darwin: "darwin", linux: "linux" };
  const archMap = { x64: "amd64", arm64: "arm64" };
  const os = platformMap[process.platform];
  const arch = archMap[process.arch];
  if (!os || !arch) {
    throw new Error(`Unsupported platform: ${process.platform}/${process.arch}. ` + "PocketBase supports windows/darwin/linux on amd64/arm64.");
  }
  return `pocketbase_${version}_${os}_${arch}.zip`;
}

async function getLatestVersion() {
  const res = await fetch(GITHUB_RELEASES_API, {
    headers: { "User-Agent": "pocketbase-embedded" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch PocketBase releases: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.tag_name) {
    throw new Error("Invalid GitHub release response: missing tag_name");
  }
  return data.tag_name.replace(/^v/, "");
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: { "User-Agent": "pocketbase-embedded" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} from ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

function extractZip(zipPath, destDir) {
  if (process.platform === "win32") {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], { stdio: "pipe", timeout: 120_000 });
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", destDir], {
      stdio: "pipe",
      timeout: 120_000,
    });
  }
}

/**
 * Downloads the PocketBase binary if not already present.
 * @param {Object} [options] - Config overrides.
 * @returns {Promise<string>} Path to the binary.
 */
export async function ensureBinary(options = {}) {
  const config = resolveConfig(options);
  const bin = binaryPath(config.dataDir);

  try {
    await fs.access(bin);
    return bin;
  } catch {}

  await fs.mkdir(config.dataDir, { recursive: true });

  let version;
  if (config.version && VERSION_RE.test(config.version)) {
    version = config.version;
  } else {
    config.log("[pb-embedded] Fetching latest version...");
    version = await getLatestVersion();
  }

  const assetName = getPlatformAssetName(version);
  const downloadUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${assetName}`;
  const zipPath = path.join(config.dataDir, assetName);

  config.log(`[pb-embedded] Downloading PocketBase v${version} (${assetName})...`);
  await downloadFile(downloadUrl, zipPath);

  extractZip(zipPath, config.dataDir);

  if (process.platform !== "win32") {
    await fs.chmod(bin, 0o755);
  }

  await fs.unlink(zipPath);
  config.log(`[pb-embedded] PocketBase v${version} installed → ${bin}`);
  return bin;
}

/**
 * Creates or updates the PocketBase superuser (admin) account.
 * @param {Object} [options] - Config overrides.
 */
export function provisionSuperuser(options = {}) {
  const config = resolveConfig(options);
  requireCredentials(config);
  const bin = binaryPath(config.dataDir);

  config.log("[pb-embedded] Provisioning superuser...");
  try {
    execFileSync(bin, ["superuser", "upsert", config.adminEmail, config.adminPassword], {
      cwd: config.dataDir,
      stdio: "pipe",
      timeout: 30_000,
    });
    config.log("[pb-embedded] Superuser provisioned");
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    if (stderr.includes("already exists")) {
      config.log("[pb-embedded] Superuser already exists");
      return;
    }
    throw new Error(`Failed to provision superuser: ${stderr || err.message}`);
  }
}

let _pbProcess = null;

/**
 * Starts the PocketBase server as a child process.
 * @param {Object} [options] - Config overrides.
 * @returns {import("node:child_process").ChildProcess}
 */
export function startProcess(options = {}) {
  const config = resolveConfig(options);
  const bin = binaryPath(config.dataDir);
  const httpAddr = `${PB_HOST}:${config.port}`;

  config.log(`[pb-embedded] Starting server on ${httpAddr} ...`);

  _pbProcess = spawn(bin, ["serve", `--http=${httpAddr}`], {
    cwd: config.dataDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  _pbProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) config.warn(`[pocketbase:stderr] ${msg}`);
  });

  _pbProcess.on("close", (code) => {
    if (code !== null && code !== 0) {
      config.error(`[pb-embedded] Process exited with code ${code}`);
    }
    _pbProcess = null;
  });

  _pbProcess.on("error", (err) => {
    config.error(`[pb-embedded] Process error: ${err.message}`);
    _pbProcess = null;
  });

  return _pbProcess;
}

/**
 * Stops the PocketBase child process.
 */
export function stopProcess() {
  if (_pbProcess) {
    _pbProcess.kill(process.platform === "win32" ? "SIGTERM" : "SIGTERM");
    _pbProcess = null;
  }
}

/** Alias for stopProcess. */
export const stop = stopProcess;

/**
 * Waits for PocketBase to respond to /api/health.
 * @param {Object} [options] - Config overrides + { maxAttempts, delayMs }.
 */
export async function waitForHealth(options = {}) {
  const config = resolveConfig(options);
  const maxAttempts = options.maxAttempts ?? 30;
  const delayMs = options.delayMs ?? 1000;
  const healthUrl = `${config.url}/api/health`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        config.log("[pb-embedded] Health check passed");
        return;
      }
    } catch {}
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(`PocketBase did not become healthy after ${maxAttempts} attempts at ${healthUrl}`);
}

const OMIT_COLLECTION_NAMES = new Set(["_superusers", "_authOrigins", "_externalAuths", "_mfas", "_otps"]);

const OMIT_FIELD_NAMES = new Set(["id", "password", "tokenKey", "email", "emailVisibility", "verified"]);

const FIELD_KEYS_BY_TYPE = {
  text: ["name", "type", "required", "min", "max", "pattern", "autogeneratePattern"],
  email: ["name", "type", "required", "exceptDomains", "onlyDomains"],
  bool: ["name", "type", "required"],
  select: ["name", "type", "required", "maxSelect", "values"],
  relation: ["name", "type", "required", "maxSelect", "minSelect", "cascadeDelete"],
  number: ["name", "type", "required", "min", "max", "onlyInt"],
  file: ["name", "type", "required", "maxSelect", "maxSize", "mimeTypes", "protected", "thumbs"],
  date: ["name", "type", "required", "min", "max"],
  url: ["name", "type", "required"],
  json: ["name", "type", "required", "maxSize"],
  autodate: ["name", "type", "required", "onCreate", "onUpdate"],
  editor: ["name", "type", "required", "maxSize", "convertURLs"],
};

function pickDefined(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function normalizeRule(value) {
  return value === undefined || value === null ? null : value;
}

function buildCollectionIdNameMap(rawCollections) {
  const map = new Map();
  for (const c of rawCollections) {
    if (c?.id && c?.name) map.set(c.id, c.name);
  }
  return map;
}

function toSafeField(field, collectionIdNameMap) {
  if (!field || !field.name || !field.type) return null;
  if (field.system || OMIT_FIELD_NAMES.has(field.name)) return null;

  const keys = FIELD_KEYS_BY_TYPE[field.type] || ["name", "type", "required"];
  const safeField = pickDefined(field, keys);

  if (field.type === "relation") {
    const related = collectionIdNameMap.get(field.collectionId);
    if (related) safeField.relationTo = related;
  }

  return safeField;
}

function toSafeCollection(collection, collectionIdNameMap) {
  if (!collection || !collection.name || !collection.type) return null;
  if (collection.name !== "users" && OMIT_COLLECTION_NAMES.has(collection.name)) return null;

  const safe = {
    name: collection.name,
    type: collection.type,
    listRule: normalizeRule(collection.listRule),
    viewRule: normalizeRule(collection.viewRule),
    createRule: normalizeRule(collection.createRule),
    updateRule: normalizeRule(collection.updateRule),
    deleteRule: normalizeRule(collection.deleteRule),
    indexes: Array.isArray(collection.indexes) ? collection.indexes : [],
    fields: Array.isArray(collection.fields) ? collection.fields.map((f) => toSafeField(f, collectionIdNameMap)).filter(Boolean) : [],
  };

  if (collection.type === "auth") {
    safe.authRule = normalizeRule(collection.authRule);
    safe.manageRule = normalizeRule(collection.manageRule);
  }

  return safe;
}

function sortCollectionsByDependencies(collections) {
  const byName = new Map(collections.map((c) => [c.name, c]));
  const deps = new Map();

  for (const c of collections) {
    const d = new Set();
    for (const f of c.fields || []) {
      if (f.type === "relation" && f.relationTo && f.relationTo !== c.name && byName.has(f.relationTo)) {
        d.add(f.relationTo);
      }
    }
    deps.set(c.name, d);
  }

  const sorted = [];
  const ready = [];

  for (const [name, d] of deps.entries()) {
    if (d.size === 0) ready.push(name);
  }

  while (ready.length > 0) {
    const name = ready.shift();
    sorted.push(byName.get(name));
    for (const [other, d] of deps.entries()) {
      if (d.has(name)) {
        d.delete(name);
        if (d.size === 0) ready.push(other);
      }
    }
    deps.delete(name);
  }

  if (deps.size > 0) {
    const remaining = collections.filter((c) => deps.has(c.name));
    return [...sorted, ...remaining];
  }

  return sorted;
}

/**
 * Converts a native PocketBase schema (pb_schema.json) to a portable
 * safe schema (db_schema.json).
 *
 * @param {Object} [options] - Config overrides.
 * @returns {Promise<number>} Number of collections written.
 */
export async function buildSafeSchema(options = {}) {
  const config = resolveConfig(options);
  const inputPath = config.pbSchemaPath;
  const outputPath = config.dbSchemaPath;

  const rawText = await fs.readFile(inputPath, "utf8");
  const rawSchema = JSON.parse(rawText);

  if (!Array.isArray(rawSchema)) {
    throw new Error(`Input schema must be an array of collections. Got ${typeof rawSchema} from ${inputPath}`);
  }

  const idNameMap = buildCollectionIdNameMap(rawSchema);
  const safeCollections = rawSchema.map((c) => toSafeCollection(c, idNameMap)).filter(Boolean);

  const sorted = sortCollectionsByDependencies(safeCollections);

  const safeSchema = {
    formatVersion: 1,
    source: path.basename(inputPath),
    generatedAt: new Date().toISOString(),
    collections: sorted,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(safeSchema, null, 2) + "\n", "utf8");

  config.log(`[pb-embedded] Built safe schema: ${sorted.length} collections → ${outputPath}`);
  return sorted.length;
}

async function readSafeSchemaFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(text);
  if (!json || !Array.isArray(json.collections)) {
    throw new Error("Safe schema is invalid. Expected { collections: [...] }");
  }
  return json;
}

function sanitizeCollectionPayload(collection) {
  const payload = {
    name: collection.name,
    type: collection.type,
    listRule: collection.listRule ?? null,
    viewRule: collection.viewRule ?? null,
    createRule: collection.createRule ?? null,
    updateRule: collection.updateRule ?? null,
    deleteRule: collection.deleteRule ?? null,
    indexes: Array.isArray(collection.indexes) ? collection.indexes : [],
    fields: Array.isArray(collection.fields) ? collection.fields : [],
  };
  if (collection.type === "auth") {
    payload.authRule = collection.authRule ?? null;
    payload.manageRule = collection.manageRule ?? null;
  }
  return payload;
}

function resolveField(field, byName, collectionName) {
  if (field.type !== "relation") return { field, deferred: false };

  const target = field.relationTo;
  if (!target) {
    throw new Error(`Relation field "${field.name}" in "${collectionName}" is missing relationTo.`);
  }

  const existing = byName.get(target);
  if (!existing) return { field, deferred: true };

  const resolved = { ...field, collectionId: existing.id };
  delete resolved.relationTo;
  return { field: resolved, deferred: false };
}

function mergeFields(existing, desired) {
  const existingByName = new Map((existing || []).map((f) => [f.name, f]));
  const desiredNames = new Set((desired || []).map((f) => f.name));
  const TAIL = ["created", "updated"];
  const tailSet = new Set(TAIL);
  const merged = [];

  for (const f of existing || []) {
    if (!desiredNames.has(f.name) && !tailSet.has(f.name)) merged.push(f);
  }
  for (const f of desired || []) {
    if (tailSet.has(f.name)) continue;
    merged.push(existingByName.get(f.name) ?? f);
  }
  for (const name of TAIL) {
    const f = existingByName.get(name) ?? (desired || []).find((x) => x.name === name);
    if (f) merged.push(f);
  }

  return merged;
}

async function listCollections(pb) {
  const result = await pb.send("/api/collections", {
    method: "GET",
    query: { page: 1, perPage: 500 },
  });
  const items = Array.isArray(result?.items) ? result.items : [];
  const byName = new Map(items.map((c) => [c.name, c]));
  return { items, byName };
}

async function createMissingCollections(pb, collections, log) {
  let { byName } = await listCollections(pb);
  const deferred = new Map();
  const { verboseLogs } = resolveConfig({ log });

  for (const collection of collections) {
    if (byName.has(collection.name)) {
      if (verboseLogs) log(`[pb-embedded] Collection exists: ${collection.name}`);
      continue;
    }

    const payload = sanitizeCollectionPayload(collection);
    const immediateFields = [];
    const deferredFields = [];

    for (const field of payload.fields) {
      const r = resolveField(field, byName, collection.name);
      if (r.deferred) deferredFields.push(field);
      else immediateFields.push(r.field);
    }

    const allIndexes = payload.indexes;
    payload.fields = immediateFields;
    payload.indexes = [];

    let created;
    try {
      created = await pb.send("/api/collections", {
        method: "POST",
        body: payload,
      });
    } catch (err) {
      const status = err.status ?? "(no status)";
      const detail = err.data ? JSON.stringify(err.data, null, 2) : err.message;
      throw new Error(`Failed to create collection "${collection.name}" [HTTP ${status}]:\n${detail}`);
    }

    if (verboseLogs) log(`[pb-embedded] Created collection: ${created.name}`);
    byName.set(created.name, created);
    deferred.set(created.name, { fields: deferredFields, indexes: allIndexes });
  }

  return deferred;
}

async function applyDeferredAndEnsureFields(pb, collections, deferredMap, log) {
  let { byName } = await listCollections(pb);
  const { verboseLogs } = resolveConfig({ log });

  for (const collection of collections) {
    const live = byName.get(collection.name);
    if (!live) {
      throw new Error(`Collection missing after create step: ${collection.name}`);
    }

    const d = deferredMap.get(collection.name) || { fields: [], indexes: [] };
    const deferredFields = Array.isArray(d) ? d : d.fields || [];
    const deferredIndexes = Array.isArray(d) ? [] : d.indexes || [];

    const desiredFields = [];
    for (const field of collection.fields || []) {
      const r = resolveField(field, byName, collection.name);
      if (r.deferred) {
        throw new Error(`Cannot resolve relation "${field.name}" in "${collection.name}". ` + `Missing target collection "${field.relationTo}".`);
      }
      desiredFields.push(r.field);
    }

    const liveNames = new Set((live.fields || []).map((f) => f.name));
    const missing = desiredFields.filter((f) => !liveNames.has(f.name));
    const merged = mergeFields(live.fields || [], desiredFields);
    const orderChanged = merged.map((f) => f.name).join(",") !== (live.fields || []).map((f) => f.name).join(",");

    const mustUpdate = deferredFields.length > 0 || deferredIndexes.length > 0 || missing.length > 0 || orderChanged;

    if (!mustUpdate) continue;

    const body = { fields: merged };
    if (deferredIndexes.length > 0) body.indexes = deferredIndexes;

    try {
      await pb.send(`/api/collections/${live.id}`, {
        method: "PATCH",
        body,
      });
    } catch (err) {
      const status = err.status ?? "(no status)";
      const detail = err.data ? JSON.stringify(err.data, null, 2) : err.message;
      throw new Error(`Failed to patch collection "${collection.name}" [HTTP ${status}]:\n${detail}`);
    }

    if (verboseLogs) log(`[pb-embedded] Updated collection: ${collection.name}`);
    ({ byName } = await listCollections(pb));
  }
}

async function verifyCollections(pb, collections, log) {
  const result = { ok: true, failures: [] };
  const { byName } = await listCollections(pb);
  const { verboseLogs } = resolveConfig({ log });

  for (const c of collections) {
    if (!byName.get(c.name)) {
      result.ok = false;
      result.failures.push(`Missing collection: ${c.name}`);
      continue;
    }
    try {
      await pb.collection(c.name).getList(1, 1);
      if (verboseLogs) log(`[pb-embedded] Verified: ${c.name}`);
    } catch (err) {
      result.ok = false;
      result.failures.push(`Query failed for ${c.name}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Applies the safe schema (db_schema.json) to PocketBase:
 * creates missing collections, resolves relations, verifies queries.
 *
 * @param {Object} [options] - Config overrides. Can include `pb` (authenticated client).
 * @returns {Promise<{ collectionsCount: number, verification: Object }>}
 */
export async function applySchema(options = {}) {
  const config = resolveConfig(options);
  const pb = options.pb || (await getAuthenticatedClient(config));

  const schema = await readSafeSchemaFile(config.dbSchemaPath);
  config.log(`[pb-embedded] Loaded safe schema: ${config.dbSchemaPath}`);

  const collections = schema.collections || [];
  if (collections.length === 0) {
    throw new Error("Safe schema contains no collections.");
  }

  await listCollections(pb);
  config.log("[pb-embedded] Collection access test passed");

  const deferredMap = await createMissingCollections(pb, collections, config.log);
  await applyDeferredAndEnsureFields(pb, collections, deferredMap, config.log);

  const verification = await verifyCollections(pb, collections, config.log);
  if (!verification.ok) {
    for (const f of verification.failures) config.error(f);
    throw new Error("Schema verification failed.");
  }

  config.log(`[pb-embedded] Schema applied & verified: ${collections.length} collections`);
  return { collectionsCount: collections.length, verification };
}

let _adminClient = null;

async function getAuthenticatedClient(config) {
  const PB = await loadPocketBase();
  const pb = new PB(config.url);
  pb.autoCancellation(false);
  await pb.collection("_superusers").authWithPassword(config.adminEmail, config.adminPassword);
  return pb;
}

/**
 * Returns an authenticated PocketBase admin client.
 * Reuses the instance from boot() or creates a new one.
 *
 * @param {Object} [options] - Config overrides.
 * @returns {Promise<import("pocketbase").default>}
 */
export async function getClient(options = {}) {
  if (_adminClient) return _adminClient;
  const config = resolveConfig(options);
  requireCredentials(config);
  _adminClient = await getAuthenticatedClient(config);
  return _adminClient;
}

/**
 * Runs a full verification: health check, admin auth, schema queries.
 * @param {Object} [options] - Config overrides.
 * @returns {Promise<{ health: boolean, auth: boolean, schema: Object|null }>}
 */
export async function verifySetup(options = {}) {
  const config = resolveConfig(options);
  const results = { health: false, auth: false, schema: null };

  try {
    const res = await fetch(`${config.url}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    results.health = res.ok;
    config.log(`[pb-embedded] Health: ${results.health ? "OK" : "FAIL"}`);
  } catch (err) {
    config.error(`[pb-embedded] Health check failed: ${err.message}`);
  }

  if (!results.health) return results;

  requireCredentials(config);
  try {
    const pb = await getAuthenticatedClient(config);
    results.auth = true;
    config.log("[pb-embedded] Admin auth: OK");

    try {
      const schema = await readSafeSchemaFile(config.dbSchemaPath);
      const collections = schema.collections || [];
      if (collections.length > 0) {
        results.schema = await verifyCollections(pb, collections, config.log);
        config.log(`[pb-embedded] Schema: ${results.schema.ok ? "OK" : "FAIL"}`);
      }
    } catch {
      config.log("[pb-embedded] No db_schema.json found, skipping schema verification");
    }
  } catch (err) {
    config.error(`[pb-embedded] Admin auth failed: ${err.message}`);
  }

  return results;
}

/**
 * Full embedded PocketBase lifecycle:
 *   1. Detect & convert pb_schema.json → db_schema.json (if needed)
 *   2. Download PocketBase binary (if missing)
 *   3. Provision superuser account
 *   4. Start PocketBase process
 *   5. Wait for health
 *   6. Apply schema from db_schema.json
 *   7. Verify everything works
 *
 * @param {Object} [options] - Config overrides.
 * @returns {Promise<import("pocketbase").default>} Authenticated admin PocketBase client.
 */
export async function boot(options = {}) {
  const config = resolveConfig(options);
  requireCredentials(config);

  let hasDbSchema = false;
  try {
    await fs.access(config.dbSchemaPath);
    hasDbSchema = true;
  } catch {}

  if (!hasDbSchema) {
    try {
      await fs.access(config.pbSchemaPath);
      await buildSafeSchema(options);
    } catch {
      throw new Error(`No schema files found.\n` + `  Expected: ${config.dbSchemaPath}\n` + `       or: ${config.pbSchemaPath}\n` + `  Export your PocketBase schema or create one of these files.`);
    }
  }

  await ensureBinary(options);

  let port;
  if (config.customPort) {
    port = config.port;
    config.log(`[pb-embedded] Using custom port ${port}`);
  } else {
    port = await resolvePort(config);
  }

  config.port = port;
  config.url = buildUrl(port);
  config.log(`[pb-embedded] Using URL: ${config.url}`);

  process.env.POCKETBASE_URL = config.url;

  const resolved = { ...options, port };

  provisionSuperuser(resolved);

  startProcess(resolved);

  await waitForHealth(resolved);

  const pb = await getAuthenticatedClient(config);
  _adminClient = pb;
  await applySchema({ ...resolved, pb });

  const verification = await verifySetup(resolved);

  if (!verification.health || !verification.auth) {
    throw new Error("Boot verification failed. Check logs above.");
  }

  config.log("[pb-embedded] Embedded: Ready");

  return pb;
}

async function cli() {
  const command = process.argv[2] || "boot";

  const commands = {
    async boot() {
      const pb = await boot();
      console.log("PocketBase is running. Press Ctrl+C to stop.\n");

      const shutdown = () => {
        console.log("\nShutting down...");
        stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await new Promise(() => {});
    },

    async "build-schema"() {
      const count = await buildSafeSchema();
      console.log(`Done. ${count} collections converted.`);
    },

    async download() {
      const bin = await ensureBinary();
      console.log(`Binary ready: ${bin}`);
    },

    async "apply-schema"() {
      await applySchema();
      console.log("Schema applied successfully.");
    },

    async test() {
      const results = await verifySetup();
      console.log("\n─── Results ───");
      console.log(`  Health:  ${results.health ? "OK" : "FAIL"}`);
      console.log(`  Auth:    ${results.auth ? "OK" : "FAIL"}`);
      console.log(`  Schema:  ${results.schema ? (results.schema.ok ? "OK" : "FAIL") : "— skipped"}`);

      if (!results.health || !results.auth || (results.schema && !results.schema.ok)) {
        process.exitCode = 1;
      }
    },

    async help() {
      console.log(`
pb-embedded.js — Universal embedded PocketBase manager

Usage:
  node pb-embedded.js [command]

Commands:
  boot            Full lifecycle: download → start → schema → verify (default)
  build-schema    Convert pb_schema.json → db_schema.json
  download        Download PocketBase binary only
  apply-schema    Apply db_schema.json to a running PocketBase instance
  test            Verify health, auth, and schema
  help            Show this help message

Environment Variables (.env):
  POCKETBASE_ADMIN_EMAIL       Superuser email (required)
  POCKETBASE_ADMIN_PASSWORD    Superuser password (required)
  POCKETBASE_PORT              Fixed port for embedded server. If omitted, a random port (8090-8190) is auto-selected and persisted across reboots.
  POCKETBASE_VERSION           Pin a specific PB version (e.g. 0.25.8)
  POCKETBASE_DATA_DIR          Data directory (default: ./data/pocketbase)
  POCKETBASE_SCHEMA            Path to pb_schema.json
  POCKETBASE_DB_SCHEMA         Path to db_schema.json
`);
    },
  };

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}\nRun with "help" for usage.`);
    process.exitCode = 1;
    return;
  }

  try {
    await handler();
  } catch (err) {
    console.error(`\n[FAIL] ${err.message}`);
    stop();
    process.exitCode = 1;
  }
}

const isDirectExecution = process.argv[1] && (process.argv[1].endsWith("pb-embedded.js") || process.argv[1].endsWith("pocketbase-embedded"));

if (isDirectExecution) {
  cli();
}
