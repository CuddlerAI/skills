#!/usr/bin/env node
// pack-openclaw.mjs — builds the folder that ClawHub publishes as the OpenClaw plugin. No dependencies; Node.js 20+.
//
//   node scripts/pack-openclaw.mjs [--out <dir>]    (default: dist/openclaw)
//
// OpenClaw reads openclaw.plugin.json first and loads the skills and the Cuddler MCP server from it, signed in with OAuth.
// The Claude manifest goes along because ClawHub files a package that carries one as a bundle plugin; without it ClawHub
// takes the package for a code plugin and asks for its source code. The package's .mcp.json is the OpenClaw form of the
// server, written from openclaw.plugin.json; the repository's .mcp.json stays the way Claude Code, Codex and Cursor read it.
// README.md comes from clawhub/README.md and the icon from assets/logo.png, at the path where OpenClaw looks for one. The
// build stops when validate.mjs reports an error, and the same files always give the same package.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLAWHUB_PACKAGE, validate } from "./validate.mjs";

/** Files and folders copied from the repository: path in the package → path in the repository. */
export const COPIED = Object.freeze({
  "openclaw.plugin.json": "openclaw.plugin.json",
  ".claude-plugin/plugin.json": ".claude-plugin/plugin.json",
  "README.md": "clawhub/README.md",
  "assets/icon.png": "assets/logo.png",
  LICENSE: "LICENSE",
  "TRADEMARKS.md": "TRADEMARKS.md",
  skills: "skills",
});
/** Upload limits of ClawHub: the whole package, and each file in it. */
export const CLAWHUB_LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, fileBytes: 10 * 1024 * 1024 });
const REPOSITORY = "https://github.com/CuddlerAI/skills";
const HOMEPAGE = "https://cuddler.ai/mcp";

const skipped = (name) => name === ".DS_Store" || name.endsWith(".review");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

/**
 * The package as sorted [path, { data, executable }] entries: the copied files, plus package.json (the name and version
 * ClawHub publishes) and .mcp.json (the server exactly as openclaw.plugin.json declares it).
 */
export function openclawPackage(root) {
  const entries = new Map();
  const add = (path, abs) => {
    if (!statSync(abs).isDirectory()) {
      entries.set(path, { data: readFileSync(abs), executable: (statSync(abs).mode & 0o111) !== 0 });
      return;
    }
    for (const name of readdirSync(abs).sort()) if (!skipped(name)) add(`${path}/${name}`, join(abs, name));
  };
  for (const [path, source] of Object.entries(COPIED)) {
    const abs = join(root, source);
    if (!existsSync(abs)) throw new Error(`${source} is missing`);
    add(path, abs);
  }
  const manifest = JSON.parse(readFileSync(join(root, "openclaw.plugin.json"), "utf8"));
  entries.set("package.json", {
    data: json({
      name: CLAWHUB_PACKAGE,
      version: manifest.version,
      description: manifest.description,
      license: "MIT",
      homepage: HOMEPAGE,
      repository: REPOSITORY,
    }),
    executable: false,
  });
  entries.set(".mcp.json", { data: json({ mcpServers: manifest.mcpServers }), executable: false });
  return [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** One hash for the whole package: each path with the hash of its bytes and its executable bit. */
export function packageDigest(entries) {
  const hash = createHash("sha256");
  for (const [path, { data, executable }] of entries) {
    hash.update(`${path}\0${executable ? "755" : "644"}\0${createHash("sha256").update(data).digest("hex")}\n`);
  }
  return hash.digest("hex");
}

/** Validates the repository, then writes the package into the folder `out`. Throws when validation or a ClawHub limit fails. */
export function packOpenclaw(root, out) {
  const { errors } = validate(root);
  if (errors.length) {
    const list = errors.map((e) => `  ${e.file}: ${e.message}`).join("\n");
    throw new Error(`validate.mjs reports ${errors.length} error(s); fix them before packaging:\n${list}`);
  }
  const entries = openclawPackage(root);
  let bytes = 0;
  for (const [path, { data }] of entries) {
    if (data.length > CLAWHUB_LIMITS.fileBytes) throw new Error(`${path} is ${data.length} bytes; ClawHub takes at most 10 MB per file`);
    bytes += data.length;
  }
  if (bytes > CLAWHUB_LIMITS.bytes) throw new Error(`the package is ${bytes} bytes; ClawHub takes at most 50 MB`);

  const target = resolve(out);
  const repo = resolve(root);
  if (target === repo || repo.startsWith(`${target}${sep}`)) throw new Error(`${out} holds the repository; pick an empty folder for the package`);
  if (existsSync(target)) {
    // Only a folder this script wrote before is cleared; anything else might be someone's files.
    const listed = readdirSync(target);
    if (listed.length && !listed.includes("openclaw.plugin.json")) throw new Error(`${out} is not empty and is not an earlier package; pick another folder`);
    rmSync(target, { recursive: true, force: true });
  }
  for (const [path, { data, executable }] of entries) {
    const file = join(target, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data, { mode: executable ? 0o755 : 0o644 });
  }
  return { out: target, files: entries.map(([path]) => path), bytes, digest: packageDigest(entries) };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const at = args.indexOf("--out");
  if (at >= 0 && !args[at + 1]) {
    console.error("usage: node scripts/pack-openclaw.mjs [--out <dir>]");
    process.exit(2);
  }
  const out = resolve(at >= 0 ? args[at + 1] : join(root, "dist", "openclaw"));
  try {
    const result = packOpenclaw(root, out);
    const shown = relative(process.cwd(), result.out) || result.out;
    console.log(`${shown} · ${result.files.length} files · ${result.bytes} bytes`);
    console.log(`digest ${result.digest}`);
    console.log(`Check it: clawhub package publish ${shown} --owner cuddler --dry-run`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
