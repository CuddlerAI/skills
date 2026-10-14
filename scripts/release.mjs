#!/usr/bin/env node
// release.mjs — the release steps that .github/workflows run after a merge, kept here so they can be tested. No
// dependencies; Node.js 20+.
//
//   node scripts/release.mjs check                       the CHANGELOG entry for VERSION has text (CI runs it on every change)
//   node scripts/release.mjs notes [<x.y.z>]             prints that entry, for the GitHub Release
//   node scripts/release.mjs summary [<x.y.z>]           prints its opening paragraph on one line, for ClawHub's changelog
//   node scripts/release.mjs assets [--out <dir>]        writes the OpenClaw and OpenAI packages as ZIPs, plus SHA256SUMS
//
// The version defaults to VERSION. The assets are the same files pack-openclaw.mjs and pack-openai.mjs build, so what a
// GitHub Release carries is what ClawHub and the OpenAI directory get; like those scripts, `assets` stops when
// validate.mjs reports an error.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { packOpenai, zip } from "./pack-openai.mjs";
import { openclawPackage } from "./pack-openclaw.mjs";
import { validate } from "./validate.mjs";

const REPOSITORY = "https://github.com/CuddlerAI/skills";

/** The text under "## [version]" up to the next entry, trimmed; null when the CHANGELOG has no such heading. */
export function changelogEntry(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return null;
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim();
}

/**
 * The entry's opening paragraph on one line, when the entry starts with one; otherwise a pointer to the release notes.
 * ClawHub shows it as the version's changelog.
 */
export function entrySummary(entry, version) {
  const first = entry.split(/\n\s*\n/)[0]?.trim() ?? "";
  if (first && !/^(#+|-|\*|\d+\.)\s/.test(first)) return first.replace(/\s+/g, " ").replace(/\*\*/g, "");
  return `Release notes: ${REPOSITORY}/releases/tag/v${version}`;
}

/** Writes cuddler-<version>-openclaw.zip, cuddler-<version>-openai.zip and SHA256SUMS into `out`. */
export function buildAssets(root, out) {
  const { errors, version } = validate(root);
  if (errors.length) {
    const list = errors.map((e) => `  ${e.file}: ${e.message}`).join("\n");
    throw new Error(`validate.mjs reports ${errors.length} error(s); fix them before releasing:\n${list}`);
  }
  mkdirSync(out, { recursive: true });
  const openclaw = join(out, `cuddler-${version}-openclaw.zip`);
  writeFileSync(openclaw, zip(openclawPackage(root).map(([name, { data, executable }]) => ({ name, data, executable }))));
  const openai = packOpenai(root, join(out, `cuddler-${version}-openai.zip`)).out;
  const sums = [openclaw, openai].map((file) => {
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    return `${sha}  ${relative(out, file)}`;
  });
  writeFileSync(join(out, "SHA256SUMS"), `${sums.join("\n")}\n`);
  return { version, files: [openclaw, openai, join(out, "SHA256SUMS")] };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const [command, ...rest] = process.argv.slice(2);
  const usage = () => {
    console.error("usage: node scripts/release.mjs check | notes [<x.y.z>] | summary [<x.y.z>] | assets [--out <dir>]");
    process.exit(2);
  };
  const version = (rest[0] && !rest[0].startsWith("--") ? rest[0] : readFileSync(join(root, "VERSION"), "utf8")).trim();
  const entry = () => changelogEntry(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
  try {
    if (command === "check") {
      const text = entry();
      if (text === null) throw new Error(`CHANGELOG.md has no entry for ${version}`);
      if (!text) throw new Error(`the CHANGELOG entry for ${version} is empty; say what changed before this ships`);
      console.log(`CHANGELOG entry for ${version}: ${text.split("\n").length} line(s)`);
    } else if (command === "notes" || command === "summary") {
      const text = entry();
      if (!text) throw new Error(`CHANGELOG.md has no text for ${version}`);
      console.log(command === "notes" ? text : entrySummary(text, version));
    } else if (command === "assets") {
      const at = rest.indexOf("--out");
      if (at >= 0 && !rest[at + 1]) usage();
      const out = resolve(at >= 0 ? rest[at + 1] : join(root, "dist", "release"));
      for (const file of buildAssets(root, out).files) console.log(relative(process.cwd(), file) || file);
    } else {
      usage();
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
