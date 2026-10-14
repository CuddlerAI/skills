#!/usr/bin/env node
// pack-openai.mjs — builds the ZIP that the OpenAI plugin directory (shared by ChatGPT and Codex) takes on upload.
// No dependencies; Node.js 20+.
//
//   node scripts/pack-openai.mjs [--out <file>]    (default: dist/cuddler-<version>-openai.zip)
//
// The plugin sits at the root of the archive with the Codex manifest only: .codex-plugin/plugin.json, .mcp.json,
// skills/, assets/, LICENSE and TRADEMARKS.md. Other hosts' manifests, the evals, CI files and docs stay out. The package's
// .mcp.json is the repository's without request headers: the directory rejects a server with headers, so the source header
// the marketplace installs send stays out, and Cuddler tells directory connections apart by their OAuth client. The build
// stops when validate.mjs reports an error, and the same files always give the same bytes.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";
import { validate } from "./validate.mjs";

/** What the package holds; the directory reads the manifest, the MCP configuration, the skills and the images. */
export const PACKAGE_ENTRIES = Object.freeze([".codex-plugin/plugin.json", ".mcp.json", "LICENSE", "TRADEMARKS.md", "assets", "skills"]);
/** Upload limits of the directory. */
export const ARCHIVE_LIMITS = Object.freeze({ bytes: 100 * 1024 * 1024, entries: 5000, depth: 20 });

const skipped = (name) => name === ".DS_Store" || name.endsWith(".review");

/** The files that go into the package, as sorted repository-relative paths with forward slashes. */
export function packageFiles(root) {
  const files = [];
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!statSync(abs).isDirectory()) {
      files.push(rel.split(sep).join("/"));
      return;
    }
    for (const name of readdirSync(abs)) if (!skipped(name)) walk(join(rel, name));
  };
  for (const entry of PACKAGE_ENTRIES) {
    if (!existsSync(join(root, entry))) throw new Error(`${entry} is missing`);
    walk(entry);
  }
  return files.sort();
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE_1980_01_01 = (0 << 9) | (1 << 5) | 1; // fixed timestamps keep the archive reproducible
const UTF8_NAMES = 0x0800;

/** A ZIP of { name, data, executable } entries: deflate where it helps, stored otherwise, no extra fields. */
export function zip(entries) {
  const records = [];
  const directory = [];
  let offset = 0;
  for (const { name, data, executable } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const method = deflated.length < data.length ? 8 : 0;
    const body = method === 8 ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time 00:00
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    records.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by: Unix, 2.0 (so the mode bits below are read)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(((executable ? 0o100755 : 0o100644) * 0x10000) >>> 0, 38); // regular file, Unix mode
    central.writeUInt32LE(offset, 42);
    directory.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, end]);
}

/** The repository's .mcp.json without request headers on any server, as the directory takes it. */
export function directoryMcpConfig(root) {
  const config = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
  const servers = Object.fromEntries(
    Object.entries(config.mcpServers ?? {}).map(([name, server]) => {
      const { headers, http_headers, ...rest } = server;
      return [name, rest];
    }),
  );
  return Buffer.from(`${JSON.stringify({ ...config, mcpServers: servers }, null, 2)}\n`);
}

/** Validates the repository, then writes the package to `out`. Throws when validation or a directory limit fails. */
export function packOpenai(root, out) {
  const { errors } = validate(root);
  if (errors.length) {
    const list = errors.map((e) => `  ${e.file}: ${e.message}`).join("\n");
    throw new Error(`validate.mjs reports ${errors.length} error(s); fix them before packaging:\n${list}`);
  }
  const files = packageFiles(root);
  if (files.length > ARCHIVE_LIMITS.entries) throw new Error(`${files.length} files; the directory takes at most ${ARCHIVE_LIMITS.entries}`);
  for (const rel of files) {
    if (rel.split("/").length > ARCHIVE_LIMITS.depth) throw new Error(`${rel} is nested deeper than ${ARCHIVE_LIMITS.depth} levels`);
  }
  const archive = zip(
    files.map((rel) => {
      const abs = join(root, rel);
      const data = rel === ".mcp.json" ? directoryMcpConfig(root) : readFileSync(abs);
      return { name: rel, data, executable: (statSync(abs).mode & 0o111) !== 0 };
    }),
  );
  if (archive.length > ARCHIVE_LIMITS.bytes) throw new Error(`the archive is ${archive.length} bytes; the directory takes at most 100 MB`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, archive);
  return { out, files, bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex") };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const at = args.indexOf("--out");
  if (at >= 0 && !args[at + 1]) {
    console.error("usage: node scripts/pack-openai.mjs [--out <file>]");
    process.exit(2);
  }
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  const out = resolve(at >= 0 ? args[at + 1] : join(root, "dist", `cuddler-${version}-openai.zip`));
  try {
    const result = packOpenai(root, out);
    console.log(`${relative(process.cwd(), result.out) || result.out} · ${result.files.length} files · ${result.bytes} bytes`);
    console.log(`sha256 ${result.sha256}`);
    console.log("Upload it on the OpenAI Platform: Plugins → Upload new or existing plugin.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
