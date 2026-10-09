#!/usr/bin/env node
// claims.mjs — renders claims.json into the README blocks marked <!-- claims:<key> --> … <!-- /claims:<key> -->.
// No dependencies; Node.js 20+.
//
//   node scripts/claims.mjs           rewrite the README blocks from claims.json
//   node scripts/claims.mjs --check   exit 1 if a block differs (validate.mjs runs the same check)
//
// A key is a dotted path into claims.json. A string renders as itself; a list of strings renders as a
// bash code block, one command per line; an object of { label, url } entries renders as links joined by " · ".

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Keys every claims.json must define. */
export const REQUIRED_CLAIMS = [
  "tagline",
  "beta",
  "mcp.url",
  "install.claude_code",
  "install.codex",
  "install.other",
  "credits",
  "limits",
  "plans",
  "links",
];

/** Blocks the README must carry, so the public page always shows them. */
export const REQUIRED_README_BLOCKS = [
  "tagline",
  "beta",
  "install.claude_code",
  "install.codex",
  "install.other",
  "credits",
  "limits",
  "plans",
  "links",
];

/** Every link we publish carries the same attribution; channels change only utm_source. */
export const README_UTM = "utm_source=github&utm_medium=readme&utm_campaign=agent_skills";

const BLOCK_RE = /<!-- claims:([a-z0-9_.]+) -->\n([\s\S]*?)\n?<!-- \/claims:\1 -->/g;

export function lookup(claims, key) {
  return key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), claims);
}

export function render(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length && value.every((line) => typeof line === "string")) {
    return ["```bash", ...value, "```"].join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.values(value);
    if (entries.length && entries.every((e) => e && typeof e.label === "string" && typeof e.url === "string")) {
      return entries.map((e) => `[${e.label}](${e.url})`).join(" · ");
    }
  }
  throw new Error("not renderable: use a string, a list of commands, or { label, url } entries");
}

/** The README's blocks: key → current content. */
export function readmeBlocks(text) {
  return new Map([...text.matchAll(BLOCK_RE)].map((m) => [m[1], m[2]]));
}

/** The README with every block re-rendered from claims; throws on an unknown or unrenderable key. */
export function syncReadme(text, claims) {
  return text.replace(BLOCK_RE, (_, key) => {
    const value = lookup(claims, key);
    if (value === undefined) throw new Error(`README block "${key}" has no value in claims.json`);
    return `<!-- claims:${key} -->\n${render(value)}\n<!-- /claims:${key} -->`;
  });
}

/** The README text with every claims block removed (for lints that must skip generated text). */
export function withoutBlocks(text) {
  return text.replace(BLOCK_RE, "");
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const claims = JSON.parse(readFileSync(join(root, "claims.json"), "utf8"));
  const readmePath = join(root, "README.md");
  const before = readFileSync(readmePath, "utf8");
  const after = syncReadme(before, claims);
  if (process.argv.includes("--check")) {
    if (before !== after) {
      console.error("README.md is out of date with claims.json: run `node scripts/claims.mjs`");
      process.exit(1);
    }
    console.log("README.md matches claims.json");
  } else if (before !== after) {
    writeFileSync(readmePath, after);
    console.log("README.md updated from claims.json");
  } else {
    console.log("README.md already matches claims.json");
  }
}
