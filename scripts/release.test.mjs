// Tests for bump.mjs and release.mjs.
//   node --test scripts/release.test.mjs
// Each test that writes files works on a copy of the repository in a temp directory.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { VERSIONED_FILES, bump, compareVersions } from "./bump.mjs";
import { buildAssets, changelogEntry, entrySummary } from "./release.mjs";
import { validate } from "./validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function withCopy(run) {
  const dir = mkdtempSync(join(tmpdir(), "cuddler-release-test-"));
  try {
    cpSync(ROOT, dir, {
      recursive: true,
      filter: (src) => !src.split(sep).some((part) => [".git", "node_modules", "results", "dist"].includes(part) || part.endsWith(".review")),
    });
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
const nextPatch = (v) => v.replace(/\d+$/, (n) => String(Number(n) + 1));

/** The entries of a ZIP that zip() wrote (stored or deflated, no extra fields), as name → bytes. */
function unzip(buffer) {
  const files = new Map();
  let at = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const method = buffer.readUInt16LE(at + 8);
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extra = buffer.readUInt16LE(at + 28);
    const name = buffer.toString("utf8", at + 30, at + 30 + nameLength);
    const start = at + 30 + nameLength + extra;
    const data = buffer.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data) : data);
    at = start + size;
  }
  return files;
}

test("compareVersions orders x.y.z numerically", () => {
  assert.ok(compareVersions("0.3.10", "0.3.9") > 0);
  assert.ok(compareVersions("0.4.0", "0.3.99") > 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.ok(compareVersions("0.3.9", "0.3.10") < 0);
});

test("bump moves every version and adds an empty CHANGELOG entry that CI rejects until it has text", () =>
  withCopy((dir) => {
    const before = read(dir, "VERSION").trim();
    const next = nextPatch(before);
    const result = bump(dir, next, "2026-10-15");
    assert.equal(result.from, before);
    assert.equal(read(dir, "VERSION"), `${next}\n`);
    for (const [rel, count] of VERSIONED_FILES) {
      const text = read(dir, rel);
      assert.equal(text.match(new RegExp(`"version": "${next.replaceAll(".", "\\.")}"`, "g"))?.length, count, rel);
      assert.ok(!text.includes(`"version": "${before}"`), rel);
    }
    // Only the version strings change: the openclaw manifest keeps its one-line skills array.
    assert.match(read(dir, "openclaw.plugin.json"), /"skills": \["\.\/skills"\]/);
    const changelog = read(dir, "CHANGELOG.md");
    assert.ok(changelog.indexOf(`## [${next}] — 2026-10-15`) < changelog.indexOf(`## [${before}]`));
    assert.equal(changelogEntry(changelog, next), "");
    assert.deepEqual(validate(dir).errors, []);

    writeFileSync(join(dir, "CHANGELOG.md"), changelog.replace(`## [${next}] — 2026-10-15\n\n`, `## [${next}] — 2026-10-15\n\nWording.\n\n`));
    assert.equal(changelogEntry(read(dir, "CHANGELOG.md"), next), "Wording.");
  }));

test("bump refuses an older version and leaves every file alone when one is out of step", () =>
  withCopy((dir) => {
    const before = read(dir, "VERSION").trim();
    assert.throws(() => bump(dir, before, "2026-10-15"), /is not newer/);
    assert.throws(() => bump(dir, "0.0.1", "2026-10-15"), /is not newer/);
    assert.throws(() => bump(dir, "1.0", "2026-10-15"), /not an x\.y\.z version/);
    assert.throws(() => bump(dir, nextPatch(before), "15/10/2026"), /not a YYYY-MM-DD date/);

    const cursor = read(dir, ".cursor-plugin/plugin.json");
    writeFileSync(join(dir, ".cursor-plugin/plugin.json"), cursor.replace(`"version": "${before}"`, `"version": "9.9.9"`));
    const snapshot = Object.fromEntries(["VERSION", "CHANGELOG.md", ...VERSIONED_FILES.map(([rel]) => rel)].map((rel) => [rel, read(dir, rel)]));
    assert.throws(() => bump(dir, nextPatch(before), "2026-10-15"), /\.cursor-plugin\/plugin\.json has 0 "version" field/);
    for (const [rel, text] of Object.entries(snapshot)) assert.equal(read(dir, rel), text, `${rel} changed`);
  }));

test("changelogEntry and entrySummary read one entry", () => {
  const changelog = [
    "# Changelog",
    "",
    "Intro.",
    "",
    "## [0.3.11] — 2026-10-14",
    "",
    "Wording. **Nothing** changes",
    "in what the skills do.",
    "",
    "### Changed",
    "",
    "- One.",
    "",
    "## [0.3.1] — 2026-10-01",
    "",
    "### Fixed",
    "",
    "- Two.",
  ].join("\n");
  assert.equal(changelogEntry(changelog, "0.3.11"), "Wording. **Nothing** changes\nin what the skills do.\n\n### Changed\n\n- One.");
  assert.equal(changelogEntry(changelog, "0.3.1"), "### Fixed\n\n- Two.");
  assert.equal(changelogEntry(changelog, "0.3.2"), null);
  assert.equal(entrySummary(changelogEntry(changelog, "0.3.11"), "0.3.11"), "Wording. Nothing changes in what the skills do.");
  assert.equal(entrySummary(changelogEntry(changelog, "0.3.1"), "0.3.1"), "Release notes: https://github.com/CuddlerAI/skills/releases/tag/v0.3.1");
});

test("the CHANGELOG entry for VERSION in this repository has text", () => {
  const version = read(ROOT, "VERSION").trim();
  assert.ok(changelogEntry(read(ROOT, "CHANGELOG.md"), version), `no text for ${version}`);
});

test("buildAssets writes both packages, a ZIP per skill and their checksums", () =>
  withCopy((dir) => {
    const out = join(dir, "dist", "release");
    const { version, files } = buildAssets(dir, out);
    const skills = ["cuddler-character-clip", "cuddler-generate", "cuddler-review", "cuddler-setup", "cuddler-watermark"];
    assert.deepEqual(
      files.map((f) => f.slice(out.length + 1)),
      [`cuddler-${version}-openclaw.zip`, `cuddler-${version}-openai.zip`, ...skills.map((s) => `${s}.zip`), "SHA256SUMS"],
    );
    const openclaw = unzip(readFileSync(files[0]));
    assert.equal(JSON.parse(openclaw.get("package.json")).version, version);
    assert.equal(JSON.parse(openclaw.get("openclaw.plugin.json")).version, version);
    assert.ok(openclaw.has("skills/cuddler-generate/SKILL.md"));
    const openai = unzip(readFileSync(files[1]));
    assert.equal(JSON.parse(openai.get(".codex-plugin/plugin.json")).version, version);
    for (const [i, skill] of skills.entries()) {
      // The Claude app finds the skill at <skill>/SKILL.md, so every entry sits under the skill's folder.
      const entries = unzip(readFileSync(files[2 + i]));
      assert.equal(entries.get(`${skill}/SKILL.md`)?.toString(), read(dir, `skills/${skill}/SKILL.md`));
      for (const name of entries.keys()) assert.ok(name.startsWith(`${skill}/`), `${name} is outside ${skill}/`);
    }
    assert.ok(unzip(readFileSync(files[2 + skills.indexOf("cuddler-watermark")])).has("cuddler-watermark/scripts/watermark.sh"));
    const sums = read(out, "SHA256SUMS").trim().split("\n");
    assert.equal(sums.length, 2 + skills.length);
    for (const [i, line] of sums.entries()) {
      const [sha, name] = line.split("  ");
      assert.equal(name, files[i].slice(out.length + 1));
      assert.equal(sha, createHash("sha256").update(readFileSync(files[i])).digest("hex"));
    }
  }));

test("buildAssets stops when the repository doesn't validate", () =>
  withCopy((dir) => {
    writeFileSync(join(dir, "VERSION"), "not-a-version\n");
    assert.throws(() => buildAssets(dir, join(dir, "dist", "release")), /validate\.mjs reports/);
  }));
