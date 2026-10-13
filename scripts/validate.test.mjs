// Tests for validate.mjs and claims.mjs (and a smoke test for skills/cuddler-review/scripts/contact-sheet.sh).
//   node --test scripts/validate.test.mjs
// Every red fixture copies the repository to a temp directory, breaks one thing, and expects the matching error.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { render, syncReadme } from "./claims.mjs";
import { crc32, packOpenai, packageFiles } from "./pack-openai.mjs";
import { wordingProblems } from "./public-wording.mjs";
import { githubSlug, parseFrontmatter, validate } from "./validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = ["cuddler-setup", "cuddler-generate", "cuddler-character-clip", "cuddler-review"];

function copyRepo(dir) {
  cpSync(ROOT, dir, {
    recursive: true,
    filter: (src) => !src.split(sep).some((part) => [".git", "node_modules", "results", "dist"].includes(part) || part.endsWith(".review")),
  });
}

function withCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "cuddler-skills-test-"));
  try {
    copyRepo(dir);
    mutate(dir);
    return validate(dir).errors.map((e) => `${e.file}: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The entries of a ZIP, read back through its central directory. */
function readZip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const offset = bytes.readUInt32LE(at + 42);
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    const raw = bytes.subarray(start, start + size);
    entries.push({
      name: bytes.toString("utf8", at + 46, at + 46 + nameLength),
      crc: bytes.readUInt32LE(at + 16),
      mode: bytes.readUInt32LE(at + 38) >>> 16,
      data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw),
    });
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  return entries;
}

const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), "utf8")));
const editJson = (dir, rel, fn) => edit(dir, rel, (t) => `${JSON.stringify(fn(JSON.parse(t)), null, 2)}\n`);

function expectError(errors, pattern) {
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}; got:\n${errors.join("\n") || "(no errors)"}`);
}

test("the repository itself passes", () => {
  const { errors } = validate(ROOT);
  assert.deepEqual(errors.map((e) => `${e.file}: ${e.message}`), []);
});

test("frontmatter: quoted one-line values parse; block scalars are refused", () => {
  const ok = parseFrontmatter("---\nname: demo\ndescription: 'Use when: it''s needed. NOT for: other things.'\nargument-hint: \"[a] [b]\"\n---\nbody\n");
  assert.equal(ok.data.name, "demo");
  assert.equal(ok.data.description, "Use when: it's needed. NOT for: other things.");
  assert.equal(ok.data["argument-hint"], "[a] [b]");
  assert.throws(() => parseFrontmatter("---\nname: demo\ndescription: >-\n  folded\n---\n"), /block scalars|empty value/);
  assert.throws(() => parseFrontmatter("---\ndescription: Use when: x\n---\n"), /quote it/);
  assert.throws(() => parseFrontmatter("---\nname: a\nname: b\n---\n"), /duplicate/);
});

test("github anchors are computed like GitHub does", () => {
  assert.equal(githubSlug("5. Refusals"), "5-refusals");
  assert.equal(githubSlug("Step 1 — Pull the character"), "step-1--pull-the-character");
});

test("claims render: strings, command lists and links", () => {
  assert.equal(render("Hello."), "Hello.");
  assert.equal(render(["a", "b"]), "```bash\na\nb\n```");
  assert.equal(render({ x: { label: "X", url: "https://cuddler.ai/?u" } }), "[X](https://cuddler.ai/?u)");
  assert.throws(() => render({ x: 1 }), /not renderable/);
  assert.equal(syncReadme("<!-- claims:tagline -->\nold\n<!-- /claims:tagline -->", { tagline: "new" }), "<!-- claims:tagline -->\nnew\n<!-- /claims:tagline -->");
});

test("a name that differs from its directory fails", () => {
  expectError(withCopy((d) => edit(d, "skills/cuddler-review/SKILL.md", (t) => t.replace("name: cuddler-review", "name: cuddler-clip-review"))), /must equal the directory name/);
});

test("a skill name without the cuddler- prefix fails", () => {
  const errors = withCopy((d) => {
    cpSync(join(d, "skills/cuddler-review"), join(d, "skills/review"), { recursive: true });
    rmSync(join(d, "skills/cuddler-review"), { recursive: true });
    edit(d, "skills/review/SKILL.md", (t) => t.replace("name: cuddler-review", "name: review"));
  });
  expectError(errors, /directory name "review" must start with "cuddler-"/);
});

test("descriptions need Use when and NOT for, and at most 1024 characters", () => {
  expectError(withCopy((d) => edit(d, "skills/cuddler-generate/SKILL.md", (t) => t.replace("NOT for:", "Not for:"))), /must contain "NOT for"/);
  expectError(withCopy((d) => edit(d, "skills/cuddler-generate/SKILL.md", (t) => t.replace("Use when", "When"))), /must contain "Use when"/);
  expectError(withCopy((d) => edit(d, "skills/cuddler-generate/SKILL.md", (t) => t.replace("description: '", `description: '${"x".repeat(1100)} `))), /limit is 1024/);
});

test("a SKILL.md over 300 lines fails", () => {
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-setup/SKILL.md"), "\nfiller\n".repeat(200))), /lines; the limit is 300/);
});

test("Hard rules that drift in one skill fail", () => {
  expectError(withCopy((d) => edit(d, "skills/cuddler-review/SKILL.md", (t) => t.replace("`reply proceed` in English", "`reply yes` in English"))), /Hard rules differ/);
  expectError(
    withCopy((d) => {
      for (const s of SKILLS) edit(d, `skills/${s}/SKILL.md`, (t) => t.replace("**Content red lines.** Adults only, in adult contexts.", "**Content red lines.** Use judgement."));
    }),
    /must keep the phrase "Adults only"/,
  );
});

test("a skill missing from the marketplace, README or INSTALL fails", () => {
  expectError(withCopy((d) => edit(d, ".claude-plugin/marketplace.json", (t) => t.replace(',\n        "./skills/cuddler-review"', ""))), /does not list the skill "cuddler-review"/);
  expectError(withCopy((d) => edit(d, "README.md", (t) => t.replace("[`cuddler-review`](skills/cuddler-review/SKILL.md)", "`cuddler-review`"))), /README\.md: .*does not list the skill "cuddler-review"/);
  expectError(withCopy((d) => edit(d, "INSTALL.md", (t) => t.replaceAll("/cuddler:cuddler-review", "the cuddler-review skill"))), /INSTALL\.md: .*does not list the skill "cuddler-review"/);
});

test("a renamed skill directory is caught everywhere it is listed", () => {
  const errors = withCopy((d) => {
    cpSync(join(d, "skills/cuddler-review"), join(d, "skills/cuddler-clip-review"), { recursive: true });
    rmSync(join(d, "skills/cuddler-review"), { recursive: true });
    edit(d, "skills/cuddler-clip-review/SKILL.md", (t) => t.replace("name: cuddler-review", "name: cuddler-clip-review"));
  });
  expectError(errors, /marketplace\.json: .*lists "cuddler-review", which is not a skill directory/);
  expectError(errors, /does not list the skill "cuddler-clip-review"/);
  expectError(errors, /refers to a skill "cuddler-review" that does not exist/);
  expectError(errors, /evals\/README\.md: a case names a skill "cuddler-review"/);
});

test("version drift fails", () => {
  const errors = withCopy((d) => writeFileSync(join(d, "VERSION"), "99.0.0\n"));
  expectError(errors, /marketplace\.json: plugins\[0\]\.version/);
  expectError(errors, /\.codex-plugin\/plugin\.json: version/);
  expectError(errors, /CHANGELOG\.md: the newest entry/);
});

test("manifests must stay MIT, on this repository, without strict:false", () => {
  expectError(withCopy((d) => editJson(d, ".codex-plugin/plugin.json", (j) => ({ ...j, license: "Proprietary" }))), /license must be "MIT"/);
  expectError(withCopy((d) => editJson(d, ".cursor-plugin/plugin.json", (j) => ({ ...j, repository: "https://github.com/CuddlerAI/cuddler-skills" }))), /repository must be/);
  expectError(withCopy((d) => editJson(d, ".cursor-plugin/plugin.json", (j) => ({ ...j, mcpServers: undefined }))), /cursor-plugin\/plugin\.json: mcpServers must be "\.\/\.mcp\.json"/);
  expectError(withCopy((d) => editJson(d, ".cursor-plugin/plugin.json", (j) => ({ ...j, logo: "./assets/missing.png" }))), /logo \.\/assets\/missing\.png does not exist/);
  expectError(withCopy((d) => edit(d, ".claude-plugin/marketplace.json", (t) => t.replace('"source": "./",', '"source": "./",\n      "strict": false,'))), /strict must not be false/);
});

test("the Codex manifest must fit the OpenAI plugin directory listing rules", () => {
  const codex = (fn) => withCopy((d) => editJson(d, ".codex-plugin/plugin.json", fn));
  const iface = (patch) => (j) => ({ ...j, interface: { ...j.interface, ...patch } });
  expectError(codex(iface({ shortDescription: "Make videos and images with your Cuddler account" })), /interface\.shortDescription is \d+ characters; the limit is 30/);
  expectError(codex(iface({ defaultPrompt: ["a", "b", "c", "d"] })), /interface\.defaultPrompt has 4 prompts; the limit is 3/);
  expectError(codex(iface({ defaultPrompt: ["@Cuddler make a clip"] })), /may not @-mention/);
  expectError(codex(iface({ supportURL: undefined })), /interface\.supportURL is required/);
  expectError(codex(iface({ privacyPolicyURL: "http://cuddler.ai/privacy" })), /interface\.privacyPolicyURL must be an https URL/);
  expectError(codex(iface({ longDescription: "Upgrade your membership for more videos." })), /may not advertise prices, subscriptions, upgrades or promotions/);
  expectError(codex(iface({ composerIcon: undefined })), /interface\.composerIcon is required/);
  expectError(codex(iface({ category: "Design" })), /interface\.category "Design" is not a directory category/);
  expectError(codex((j) => ({ ...j, description: "x".repeat(1100) })), /description is 1100 characters; the limit is 1024/);
  expectError(codex((j) => ({ ...j, mcpServers: undefined })), /mcpServers must be "\.\/\.mcp\.json"/);
  expectError(codex((j) => ({ ...j, apps: "./.app.json" })), /"apps" can't be in a package for the OpenAI plugin directory/);
  expectError(
    codex((j) => ({ ...j, extensions: { "com.openai": { onboardingSkill: "./skills/cuddler-onboarding/SKILL.md" } } })),
    /onboardingSkill .* must be \.\/skills\/<skill>\/SKILL\.md of a skill/,
  );
});

test("the Codex marketplace must keep the plugin id and sign in on install", () => {
  const market = (fn) => withCopy((d) => editJson(d, ".agents/plugins/marketplace.json", fn));
  expectError(market((j) => ({ ...j, name: "cuddler-skills" })), /differs from \.claude-plugin\/marketplace\.json "cuddler"; Codex would install the plugin under another id/);
  expectError(market((j) => ({ ...j, plugins: [{ ...j.plugins[0], policy: { installation: "AVAILABLE", authentication: "ON_USE" } }] })), /authentication must be "ON_INSTALL"/);
  expectError(market((j) => ({ ...j, plugins: [{ ...j.plugins[0], source: { source: "local", path: "./plugins/cuddler" } }] })), /must be the repository root/);
  expectError(withCopy((d) => rmSync(join(d, ".agents/plugins/marketplace.json"))), /\.agents\/plugins\/marketplace\.json: required file is missing/);
});

test("pack-openai builds the directory package: plugin files only, reproducible, intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "cuddler-pack-test-"));
  try {
    const first = packOpenai(ROOT, join(dir, "a.zip"));
    const second = packOpenai(ROOT, join(dir, "b.zip"));
    assert.equal(first.sha256, second.sha256, "two builds of the same files must be byte-identical");
    const entries = readZip(readFileSync(first.out));
    const names = entries.map((e) => e.name);
    assert.deepEqual(names, packageFiles(ROOT));
    for (const required of [".codex-plugin/plugin.json", ".mcp.json", "LICENSE", "assets/logo.png", ...SKILLS.map((s) => `skills/${s}/SKILL.md`)]) {
      assert.ok(names.includes(required), `${required} is missing from the package`);
    }
    for (const name of names) assert.doesNotMatch(name, /^(?:\.claude-plugin|\.cursor-plugin|\.agents|\.github|evals|scripts)\/|^README\.md$/);
    for (const entry of entries) {
      const source = readFileSync(join(ROOT, entry.name));
      assert.ok(entry.data.equals(source), `${entry.name} differs after unzipping`);
      assert.equal(entry.crc, crc32(source), `${entry.name} has a wrong CRC`);
    }
    assert.equal(entries.find((e) => e.name.endsWith("/contact-sheet.sh"))?.mode, 0o100755);
    if (spawnSync("unzip", ["-v"], { stdio: "ignore" }).status === 0) {
      const check = spawnSync("unzip", ["-tq", first.out], { encoding: "utf8" });
      assert.equal(check.status, 0, check.stdout + check.stderr);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pack-openai refuses a repository that fails validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "cuddler-pack-test-"));
  try {
    copyRepo(dir);
    editJson(dir, ".codex-plugin/plugin.json", (j) => ({ ...j, interface: { ...j.interface, category: "Design" } }));
    assert.throws(() => packOpenai(dir, join(dir, "dist", "x.zip")), /validate\.mjs reports \d+ error\(s\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("orphan references, broken links and ../ paths fail", () => {
  expectError(withCopy((d) => writeFileSync(join(d, "skills/cuddler-generate/references/unused.md"), "# unused\n")), /orphan: .*references\/unused\.md/);
  expectError(withCopy((d) => edit(d, "skills/cuddler-generate/SKILL.md", (t) => t.replaceAll("(references/prompt-craft.md)", "(references/prompt-kraft.md)"))), /does not resolve|does not exist/);
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-generate/SKILL.md"), "\nSee [the other skill](../cuddler-review/SKILL.md).\n")), /no \.\.\/ paths/);
});

test("a tool name that the Cuddler MCP server doesn't have fails", () => {
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-generate/SKILL.md"), "\nCall `get_clip` first.\n")), /`get_clip` is not a Cuddler MCP tool/);
});

test("a SKILL.md license other than MIT fails", () => {
  expectError(withCopy((d) => edit(d, "skills/cuddler-setup/SKILL.md", (t) => t.replace("license: MIT", "license: Proprietary"))), /license must be "MIT"/);
});

test("public wording: private repositories, internal paths and server settings are named", () => {
  assert.equal(wordingProblems([["t", "docs: explain the plan credits cap\n\nSee CuddlerAI/skills#6 and apps-only wording."]]).length, 0);
  const found = wordingProblems([["t", "Follows CuddlerAI/Cuddler#5813."], ["u", "the switch MCP_EXAMPLE_FLAG"], ["v", "see apps/api/src/x.ts"]]);
  assert.deepEqual(found.map((p) => p.what), ["a private repository or one of its pull requests", "a server setting", "an internal path"]);
  assert.equal(found[0].line, 1);
});

test("command-line instructions, third-party keys and fixed prices fail in public text", () => {
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-generate/SKILL.md"), "\nRun `cuddler video generate \"x\"`.\n")), /command-line instruction/);
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-review/scripts/contact-sheet.sh"), "\n# or: cuddler download <clip_id>\n")), /contact-sheet\.sh: line \d+: a command-line instruction/);
  expectError(withCopy((d) => appendFileSync(join(d, "README.md"), "\nBring your own provider key.\n")), /third-party provider key/);
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-character-clip/SKILL.md"), "\nA 15-second take costs 240 credits.\n")), /a fixed price/);
});

test("skills that sell credits, plans or upgrades fail", () => {
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-generate/SKILL.md"), "\n| Not enough credits | | Stop; the user tops up on cuddler.ai |\n")), /"tops up" sells credits or plans/);
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-generate/references/model-routing.md"), "\n`requiredPlan` says what would unlock it.\n")), /"unlock" sells credits or plans/);
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-setup/SKILL.md"), "\nUpgrade to Pro for videos.\n")), /"Upgrade to" sells credits or plans/);
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-setup/SKILL.md"), "\nPlans are at https://cuddler.ai/membership\n")), /"cuddler\.ai\/membership" sells credits or plans/);
  const allowed = withCopy((d) => appendFileSync(join(d, "skills/cuddler-setup/SKILL.md"), "\nVideos aren't in this plan; never suggest buying credits or an upgrade. Update with `codex plugin marketplace upgrade`.\n"));
  assert.ok(!allowed.some((e) => /sells credits or plans/.test(e)), allowed.join("\n"));
});

test("the README and .mcp.json must follow claims.json", () => {
  expectError(withCopy((d) => editJson(d, "claims.json", (j) => ({ ...j, tagline: "Something else." }))), /block "tagline" differs from claims\.json/);
  expectError(withCopy((d) => editJson(d, ".mcp.json", (j) => ({ mcpServers: { cuddler: { ...j.mcpServers.cuddler, url: "https://example.test/mcp" } } }))), /\.mcp\.json: cuddler\.url/);
  expectError(
    withCopy((d) => editJson(d, ".mcp.json", (j) => ({ mcpServers: { cuddler: { ...j.mcpServers.cuddler, http_headers: undefined } } }))),
    /\.mcp\.json: cuddler\.http_headers must set X-Cuddler-Source: plugin/,
  );
  expectError(
    withCopy((d) => editJson(d, ".mcp.json", (j) => ({ mcpServers: { cuddler: { ...j.mcpServers.cuddler, headers: { ...j.mcpServers.cuddler.headers, "X-Extra": "1" } } } }))),
    /\.mcp\.json: cuddler\.headers and cuddler\.http_headers must be identical/,
  );
  expectError(withCopy((d) => editJson(d, "claims.json", (j) => ({ ...j, links: { ...j.links, signup: { label: "Cuddler", url: "https://cuddler.ai/" } } }))), /must carry utm_source=github/);
  expectError(withCopy((d) => appendFileSync(join(d, "README.md"), "\nTry https://cuddler.ai/studio today.\n")), /needs the GitHub attribution/);
  expectError(withCopy((d) => edit(d, "README.md", (t) => t.replace(/<!-- claims:limits -->[\s\S]*?<!-- \/claims:limits -->\n/, ""))), /missing the generated block <!-- claims:limits -->/);
});

test("eval cases must cover every skill and name only real tools", () => {
  expectError(withCopy((d) => edit(d, "evals/README.md", (t) => t.replace("### review-existing-video", "### review-existing-clip"))), /the case "review-existing-video" has no/);
  expectError(
    withCopy((d) => edit(d, "evals/README.md", (t) => t.replace("**Skills:** cuddler-review", "**Skills:** cuddler-generate"))),
    /no eval case covers the skill "cuddler-review"/,
  );
  expectError(withCopy((d) => edit(d, "evals/quote-gate/graders/quoted.md", (t) => t.replace("__quote_video", "__price_video"))), /must be Skill or mcp__plugin_cuddler_cuddler__/);
  expectError(withCopy((d) => rmSync(join(d, "evals/mocks/cuddler/whoami.md"))), /no suite mock for whoami/);
  expectError(withCopy((d) => edit(d, "evals/quote-gate/prompt.md", (t) => t.replace("max_turns:", "turns:"))), /frontmatter key "turns" is not a claude plugin eval field/);
});

test("eval mocks must carry the server's tool list and answer in its formats", () => {
  const listing = "evals/mocks/cuddler/_tools.json";
  expectError(withCopy((d) => rmSync(join(d, listing))), /_tools\.json: missing: save the server's tools\/list/);
  const tool = (data, name) => data.tools.find((t) => t.name === name);
  expectError(
    withCopy((d) =>
      editJson(d, listing, (data) => {
        const schema = tool(data, "create_video").inputSchema;
        schema.required = schema.required.filter((arg) => arg !== "idempotencyKey");
        return data;
      }),
    ),
    /create_video does not require idempotencyKey/,
  );
  const renamed = withCopy((d) =>
    editJson(d, listing, (data) => {
      tool(data, "quote_video").name = "price_video";
      return data;
    }),
  );
  expectError(renamed, /no entry for quote_video/);
  expectError(renamed, /"price_video" is not a Cuddler MCP tool/);
  const unfence = (t) => t.replace(/^<untrusted-user-content[^>]*>\n/, "").replace(/\n<\/untrusted-user-content>\n?$/, "\n");
  expectError(withCopy((d) => edit(d, "evals/mocks/cuddler/whoami.md", unfence)), /whoami\.md: the server returns whoami inside <untrusted-user-content source="cuddler\.whoami">/);
  expectError(
    withCopy((d) => edit(d, "evals/mocks/cuddler/quote_video.md", (t) => `<untrusted-user-content source="cuddler.quote_video">\n${t.trim()}\n</untrusted-user-content>\n`)),
    /quote_video\.md: the server returns quote_video as plain JSON/,
  );
  expectError(withCopy((d) => edit(d, "evals/mocks/cuddler/list_models.md", (t) => t.replace("{", "{,"))), /list_models\.md: the result is not JSON/);
  expectError(
    withCopy((d) => edit(d, "evals/approval-link/mocks/cuddler/create_video.md", (t) => t.replace("FORBIDDEN: ", "Forbidden - "))),
    /create_video\.md: an error starts with the server's "CODE: message" line/,
  );
});

test("unpinned actions and pull_request_target fail", () => {
  expectError(withCopy((d) => edit(d, ".github/workflows/validate.yml", (t) => t.replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v4"))), /pin actions\/checkout@v4 to a full commit SHA/);
  expectError(withCopy((d) => edit(d, ".github/workflows/validate.yml", (t) => t.replace("  pull_request:\n", "  pull_request_target:\n"))), /pull_request_target/);
});

test("direct API calls, admin routes, internal addresses, secrets and email addresses fail", () => {
  expectError(withCopy((d) => appendFileSync(join(d, "skills/cuddler-generate/references/model-routing.md"), "\n```bash\ncurl -s https://api.cuddler.ai/api/v1/me\n```\n")), /calls the API directly/);
  expectError(withCopy((d) => appendFileSync(join(d, "README.md"), "\nOps: POST /api/admin/report\n")), /admin route/);
  expectError(withCopy((d) => appendFileSync(join(d, "CONTRIBUTING.md"), "\nSee docs/design_example_2026-01.md\n")), /document path from a private repository/);
  expectError(withCopy((d) => appendFileSync(join(d, "INSTALL.md"), `\ntoken: cud_pat_${"a1B2".repeat(6)}\n`)), /personal access token/);
  expectError(withCopy((d) => appendFileSync(join(d, "evals/README.md"), "\nContact someone@example.com\n")), /email address/);
});

// ── skills/cuddler-review/scripts/contact-sheet.sh ───────────────────────────

const hasFfmpeg = ["ffmpeg", "ffprobe"].every((bin) => spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0);

test(
  "contact-sheet.sh measures a synthetic clip",
  { skip: hasFfmpeg || process.env.REQUIRE_FFMPEG ? false : "ffmpeg is not installed" },
  (t) => {
    assert.ok(hasFfmpeg, "ffmpeg and ffprobe are required (REQUIRE_FFMPEG is set)");
    const dir = mkdtempSync(join(tmpdir(), "cuddler-review-test-"));
    try {
      const clip = join(dir, "clip.mp4");
      // 6 s, 9:16: 3 s of test pattern then 3 s of solid red (a hard cut at 3 s);
      // audio: 1 s silence, 3 s tone, 2 s silence → onset ≈ 1 s, end hold ≈ 2 s.
      execFileSync("ffmpeg", [
        "-v", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=s=360x640:r=24:d=3",
        "-f", "lavfi", "-i", "color=c=red:s=360x640:r=24:d=3",
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-f", "lavfi", "-i", "sine=f=440:r=48000",
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a]atrim=duration=1[a0];[3:a]atrim=duration=3,volume=0.5[a1];[2:a]atrim=duration=2,asetpts=PTS-STARTPTS[a2];[a0][a1][a2]concat=n=3:v=0:a=1[a]",
        "-map", "[v]", "-map", "[a]", "-pix_fmt", "yuv420p", "-shortest", clip,
      ]);
      const script = join(ROOT, "skills/cuddler-review/scripts/contact-sheet.sh");
      const stdout = execFileSync("bash", [script, clip, "--expect-seconds", "6", "--expect-aspect", "9:16"], { encoding: "utf8" });
      assert.match(stdout, /next: read/);
      const summary = JSON.parse(readFileSync(join(dir, "clip.review", "summary.json"), "utf8"));
      const status = (id) => summary.checks.find((c) => c.id === id)?.status;
      t.diagnostic(`sheet ${JSON.stringify(summary.sheet)} · onset ${summary.first_sound_onset_s} s · hold ${summary.end_hold_s} s · cuts ${summary.cuts_s}`);
      assert.equal(typeof summary.sheet?.timestamps_drawn, "boolean");
      assert.equal(summary.aspect, "9:16");
      assert.ok(Math.abs(summary.duration_s - 6) < 0.15, `duration ${summary.duration_s}`);
      assert.equal(summary.has_audio, true);
      assert.ok(Math.abs(summary.first_sound_onset_s - 1) < 0.25, `onset ${summary.first_sound_onset_s}`);
      assert.ok(Math.abs(summary.end_hold_s - 2) < 0.3, `end hold ${summary.end_hold_s}`);
      assert.ok(summary.cuts_s.some((t) => Math.abs(t - 3) < 0.25), `cuts ${summary.cuts_s}`);
      assert.equal(status("duration"), "PASS");
      assert.equal(status("aspect"), "PASS");
      assert.equal(status("cuts"), "WARN");
      const bad = spawnSync("bash", [script, join(dir, "missing.mp4")], { encoding: "utf8" });
      assert.equal(bad.status, 2);
      const url = spawnSync("bash", [script, "https://example.com/clip.mp4"], { encoding: "utf8" });
      assert.equal(url.status, 2);
      assert.match(url.stderr, /get_download_link/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
