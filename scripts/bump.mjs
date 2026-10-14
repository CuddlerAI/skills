#!/usr/bin/env node
// bump.mjs — moves the version everywhere it lives, for the pull request that ships it. No dependencies; Node.js 20+.
//
//   node scripts/bump.mjs <x.y.z> [--date YYYY-MM-DD]    (default date: today, local time)
//
// It writes VERSION, the "version" of the four plugin manifests and both versions in the marketplace entry, and adds the
// heading "## [x.y.z] — date" on top of the CHANGELOG entries. Only the version strings change, so every JSON file keeps its
// layout. It refuses a version that isn't newer than VERSION and a file whose version doesn't read as VERSION. The new
// CHANGELOG entry starts empty: write it before you push, because CI fails on an empty entry (release.mjs check).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Every manifest that carries the version, with how many "version" fields in it must equal VERSION. */
export const VERSIONED_FILES = Object.freeze([
  [".claude-plugin/plugin.json", 1],
  [".codex-plugin/plugin.json", 1],
  [".cursor-plugin/plugin.json", 1],
  ["openclaw.plugin.json", 1],
  [".claude-plugin/marketplace.json", 2],
]);

const SEMVER = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Negative when a is older than b, 0 when equal, positive when newer. Both are x.y.z. */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Changes the version in every file under `root` from VERSION to `next`. Returns the old version and the files written. */
export function bump(root, next, date) {
  if (!SEMVER.test(next)) throw new Error(`"${next}" is not an x.y.z version`);
  if (!DATE.test(date)) throw new Error(`"${date}" is not a YYYY-MM-DD date`);
  const read = (rel) => readFileSync(join(root, rel), "utf8");
  const current = read("VERSION").trim();
  if (!SEMVER.test(current)) throw new Error(`VERSION holds "${current}", not an x.y.z version`);
  if (compareVersions(next, current) <= 0) throw new Error(`${next} is not newer than ${current}`);

  // Check every file before writing any, so a mismatch leaves the repository as it was.
  const field = new RegExp(`("version"\\s*:\\s*")${current.replaceAll(".", "\\.")}(")`, "g");
  const writes = [];
  for (const [rel, count] of VERSIONED_FILES) {
    if (!existsSync(join(root, rel))) throw new Error(`${rel} is missing`);
    const text = read(rel);
    const found = text.match(field)?.length ?? 0;
    if (found !== count) throw new Error(`${rel} has ${found} "version" field(s) at ${current}; expected ${count}`);
    writes.push([rel, text.replace(field, `$1${next}$2`)]);
  }
  const changelog = read("CHANGELOG.md");
  const first = changelog.search(/^## \[/m);
  if (first < 0) throw new Error("CHANGELOG.md has no entry heading such as ## [x.y.z]");
  if (new RegExp(`^## \\[${next.replaceAll(".", "\\.")}\\]`, "m").test(changelog)) throw new Error(`CHANGELOG.md already has ${next}`);
  writes.push(["CHANGELOG.md", `${changelog.slice(0, first)}## [${next}] — ${date}\n\n${changelog.slice(first)}`]);
  writes.push(["VERSION", `${next}\n`]);

  for (const [rel, text] of writes) writeFileSync(join(root, rel), text);
  return { from: current, to: next, files: writes.map(([rel]) => rel) };
}

/** Today's date in local time, as YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const at = args.indexOf("--date");
  const next = args.find((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1));
  if (!next || (at >= 0 && !args[at + 1])) {
    console.error("usage: node scripts/bump.mjs <x.y.z> [--date YYYY-MM-DD]");
    process.exit(2);
  }
  try {
    const result = bump(root, next, at >= 0 ? args[at + 1] : today());
    console.log(`${result.from} → ${result.to} in ${result.files.join(", ")}`);
    console.log(`Now write the CHANGELOG entry under "## [${result.to}]".`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
