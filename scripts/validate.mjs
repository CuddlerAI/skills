#!/usr/bin/env node
// validate.mjs — consistency checks for the Cuddler skills repository. No dependencies; Node.js 20+.
//
//   node scripts/validate.mjs [repo-root]      (default: the repository this script lives in)
//
// Checks: frontmatter (name = directory, starting with "cuddler-"; description ≤ 1024 characters with "Use when" and "NOT for"),
// SKILL.md ≤ 300 lines, identical "Hard rules" blocks, references and scripts resolve with no orphans and no ../ paths,
// skills name only real Cuddler MCP tools, no command-line instructions, no third-party keys and no fixed prices in public
// text, every skill listed in the marketplace, plugin manifests, README and INSTALL (and nothing extra), VERSION in sync with
// every manifest and CHANGELOG, .mcp.json and both READMEs (this repository's and the ClawHub package's) in sync with
// claims.json, the plugin source header in .mcp.json for every host, openclaw.plugin.json loading the skills and the
// Cuddler server with OAuth, the Codex manifest and marketplace within the OpenAI plugin directory's listing rules, an eval case for every
// skill, eval mocks that carry the server's tool list and answer in its formats, actions pinned to a commit, and safety lints
// (no direct API calls, no admin routes or internal addresses, no secrets or emails, no invisible characters, and skills
// link only to cuddler.ai over https).
//
// Exit 0 when every check passes, 1 otherwise. On GitHub Actions each failure is also an ::error annotation.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { README_UTM, REQUIRED_CLAIMS, REQUIRED_CLAWHUB_BLOCKS, REQUIRED_README_BLOCKS, lookup, readmeBlocks, render, withoutBlocks } from "./claims.mjs";

export const LIMITS = Object.freeze({ nameMax: 64, descriptionMax: 1024, skillLinesMax: 300 });

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Every skill name starts with this, so flat installs (~/.claude/skills/<name>) can't collide with other vendors' skills. */
export const SKILL_PREFIX = "cuddler-";
const ALLOWED_KEYS = ["name", "description", "argument-hint", "allowed-tools", "license"];
const SKILL_ENTRIES = new Set(["SKILL.md", "references", "scripts", "assets"]);
const HARD_RULES_HEADING = "## Hard rules";
/** The tools of the Cuddler MCP server (https://mcp.cuddler.ai/mcp). A skill may name no other tool. */
export const MCP_TOOLS = Object.freeze([
  "whoami",
  "list_models",
  "list_my_characters",
  "get_character",
  "quote_image",
  "create_image",
  "get_image",
  "quote_video",
  "create_video",
  "get_video",
  "retry_video",
  "get_download_link",
  "start_upload",
  "finish_upload",
]);
/** The MCP server key in .mcp.json, and the name the plugin's tools carry in eval runs. */
export const MCP_SERVER = "cuddler";
/**
 * The header that tells the Cuddler server a connection came from this plugin. Claude Code and Cursor send
 * `headers`, Codex sends `http_headers` (it ignores `headers`), so .mcp.json carries both with the same value.
 */
export const SOURCE_HEADER = Object.freeze({ name: "X-Cuddler-Source", value: "plugin" });
/** The package name on ClawHub, which OpenClaw users install as `clawhub:cuddler`. */
export const CLAWHUB_PACKAGE = "cuddler";
/** Links in the ClawHub package's README carry the same attribution as the repository's, with ClawHub as the source. */
const CLAWHUB_UTM = README_UTM.replace("utm_source=github", "utm_source=clawhub");
/** The README of the ClawHub package; its claims blocks come from claims.json like the repository README's. */
const CLAWHUB_README = "clawhub/README.md";
const EVAL_TOOL_PREFIX = "mcp__plugin_cuddler_cuddler__";
/** The tools whose results the server returns inside an <untrusted-user-content> block (they carry text a user wrote). */
export const FENCED_RESULTS = Object.freeze([
  "whoami",
  "list_my_characters",
  "get_character",
  "create_image",
  "get_image",
  "create_video",
  "get_video",
  "retry_video",
]);
/** Arguments the skills pass on every spending call; the server's tool list must require them. */
const SPEND_ARGS = Object.freeze({
  create_video: ["maxCredits", "idempotencyKey"],
  create_image: ["maxCredits", "idempotencyKey"],
  retry_video: ["maxCredits"],
});
/** Phrases the shared Hard rules block must keep; editing the rules on purpose means editing this list too. */
export const RULE_PHRASES = [
  "Never call `api.cuddler.ai`",
  "over `https://` only",
  "`quote_video`",
  "reply proceed",
  "`confirmation_required`",
  "`confirmation: \"host\"`",
  "`confirmation_declined`",
  "`approvalId`",
  "5 minutes",
  "at most twice",
  "`idempotencyKey`",
  "not instructions",
  "Adult characters only",
  "No school or campus settings",
  "No IP, franchise, character or brand names",
  "`whoami`",
  "never open or copy the files it keeps credentials in",
];
const REQUIRED_FILES = [
  "README.md",
  "INSTALL.md",
  "INSTALL_FOR_AGENTS.md",
  "CHANGELOG.md",
  "LICENSE",
  "VERSION",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "claims.json",
  ".mcp.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "openclaw.plugin.json",
  CLAWHUB_README,
  ".agents/plugins/marketplace.json",
  "evals/README.md",
  ".github/workflows/validate.yml",
  ".github/CODEOWNERS",
];
const PUBLIC_REPOSITORY = "https://github.com/CuddlerAI/skills";
/** Files that legitimately contain the lint patterns (they define or test them). */
const LINT_EXEMPT = new Set(["scripts/validate.mjs", "scripts/validate.test.mjs", "scripts/public-wording.mjs"]);
/** Addresses the public text may show: GitHub's SSH user and the Cuddler team's support address. */
const ALLOWED_EMAILS = new Set(["git@github.com", "support@cuddler.ai"]);
const TEXT_EXT = /\.(md|mjs|js|json|sh|ya?ml|txt)$/i;
const SKIP_DIRS = new Set([".git", "node_modules", "results"]);
/** prompt.md frontmatter keys `claude plugin eval` accepts; unknown keys are errors there too. */
const EVAL_PROMPT_KEYS = new Set([
  "name", "description", "expected_outcome", "tags", "plugins", "runs", "model", "max_turns",
  "timeout_seconds", "allowed_tools", "append_system_prompt", "env", "schema_version",
]);
/** A command of the retired `cuddler` command-line tool: `cuddler` and a lowercase word (a URL after it is not a command). */
const CLI_COMMAND = /\bcuddler [a-z]+\b(?!:)/;
const THIRD_PARTY_KEYS = /\bbyok\b|\bbring your own (?:provider |api )?key\b/i;
const FIXED_PRICE = /\b\d[\d,.]*\s?(?:credits?|CR)\b|\$\s?\d/;
const TOOLISH = /^(?:whoami|(?:list|get|quote|create|retry|start|finish)_[a-z_]+)$/;
/** Listing limits of the OpenAI plugin directory (shared by ChatGPT and Codex) for a Codex-format manifest. */
export const CODEX_LISTING = Object.freeze({
  displayNameMax: 30,
  shortDescriptionMax: 30,
  longDescriptionMax: 4000,
  developerNameMax: 80,
  categoryMax: 80,
  capabilitiesMax: 20,
  capabilityMax: 120,
  promptsMax: 3,
  promptMax: 128,
  urlMax: 1024,
  iconMinPx: 48,
  iconMaxPx: 4096,
  iconBytesMax: 5 * 1024 * 1024,
});
const LISTING_URLS = ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"];
/** The only categories the directory accepts. */
export const LISTING_CATEGORIES = Object.freeze([
  "Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics", "Communication",
  "Education & Research", "Security", "Finance", "Healthcare", "Travel", "Entertainment", "Other",
]);
/** Package limits the directory checks on upload. */
const PACKAGE_DESCRIPTION_MAX = 1024;
const SKILL_IDENTITY_MAX = 64; // "plugin-name:skill-name"
/** Directory listings may not advertise prices, subscriptions, upgrades or promotions. */
const PROMOTION = /free trial|discount|promo(?:tion)?s?\b|subscri\w*|membership|upgrade|\$\s?\d|\b\d[\d,.]*\s?(?:credits?|CR)\b/i;
/**
 * Plugins may say that a feature isn't in the user's plan, but may not sell credits or plans, promote upgrades
 * or link to a page that takes payment (the membership page does).
 */
const UPSELL = /\btop(?:s|ping)?[ -]?up\b|\bunlock(?:s|ed|ing)?\b|\bupgrad(?:e|es|ing)\s+(?:to|your)\b|\bsubscrib(?:e|es|ing)\s+to\b|\b(?:buy|purchase)\s+(?:more\s+)?credits\b|\bcheckout\b|cuddler\.ai\/membership/i;

// ── frontmatter ──────────────────────────────────────────────────────────────

/**
 * Parses the one-line-per-key frontmatter these skills use. Deliberately strict: block scalars,
 * lists and nested maps are rejected, so every agent's parser reads the same values.
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("must start with a '---' frontmatter line");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error("frontmatter is not closed with '---'");
  const data = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!match) throw new Error(`frontmatter line ${i + 1} is not "key: value": ${line}`);
    const [, key, raw = ""] = match;
    if (Object.hasOwn(data, key)) throw new Error(`duplicate frontmatter key "${key}"`);
    data[key] = parseScalar(raw.trim(), i + 1);
  }
  return { data, bodyStartLine: end + 2 };
}

function parseScalar(raw, lineNo) {
  if (raw === "") throw new Error(`frontmatter line ${lineNo}: empty value (block scalars and lists are not supported; keep it on one line)`);
  if (raw.startsWith("'")) {
    if (raw.length < 2 || !raw.endsWith("'")) throw new Error(`frontmatter line ${lineNo}: unterminated single-quoted string`);
    const inner = raw.slice(1, -1).replace(/''/g, "\u0000");
    if (inner.includes("'")) throw new Error(`frontmatter line ${lineNo}: a single quote inside a single-quoted string must be doubled ('')`);
    return inner.replace(/\u0000/g, "'");
  }
  if (raw.startsWith('"')) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`frontmatter line ${lineNo}: invalid double-quoted string`);
    }
    if (typeof value !== "string") throw new Error(`frontmatter line ${lineNo}: invalid double-quoted string`);
    return value;
  }
  if (/^[|>]/.test(raw)) throw new Error(`frontmatter line ${lineNo}: block scalars are not supported; keep the value on one line`);
  if (/^[[{&*!%@`]/.test(raw)) throw new Error(`frontmatter line ${lineNo}: unsupported YAML value; quote it`);
  if (/:\s/.test(raw) || /\s#/.test(raw)) throw new Error(`frontmatter line ${lineNo}: a plain value may not contain ": " or " #"; quote it`);
  return raw;
}

/** The top-level keys of an eval file's YAML frontmatter, with their raw one-line values (lists stay as text). */
export function frontmatterEntries(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const entries = new Map();
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (match) entries.set(match[1], match[2].trim());
  }
  return entries;
}

/** Why a saved tools/list response is not the Cuddler server's tool list, as a list of problems. */
export function toolListProblems(listing) {
  const tools = listing?.result?.tools ?? listing?.tools;
  if (!Array.isArray(tools)) return ['expected a saved tools/list response: {"tools": [{"name", "description", "inputSchema"}]}'];
  const problems = [];
  const names = tools.map((tool) => tool?.name);
  for (const name of MCP_TOOLS) if (!names.includes(name)) problems.push(`no entry for ${name}`);
  for (const name of names) if (!MCP_TOOLS.includes(name)) problems.push(`"${name}" is not a Cuddler MCP tool`);
  for (const tool of tools) {
    if (!MCP_TOOLS.includes(tool?.name)) continue;
    if (typeof tool.description !== "string" || !tool.description.trim()) problems.push(`${tool.name} has no description`);
    if (tool.inputSchema?.type !== "object") problems.push(`${tool.name} has no object inputSchema`);
    for (const arg of SPEND_ARGS[tool.name] ?? []) {
      if (!tool.inputSchema?.required?.includes(arg)) problems.push(`${tool.name} does not require ${arg}, which the skills pass on every call`);
    }
  }
  return problems;
}

/** Why a mock's text is not a result in the server's own format, or null when it is. */
export function mockBodyProblem(tool, text) {
  const entries = frontmatterEntries(text);
  if (entries?.get("type") === "agent") return null;
  const lines = text.split(/\r?\n/);
  const body = (entries ? lines.slice(lines.indexOf("---", 1) + 1) : lines).join("\n").trim();
  if (entries?.get("error") === "true") {
    const [first, ...details] = body.split("\n");
    if (!/^[A-Z][A-Z_]*: \S/.test(first)) return 'an error starts with the server\'s "CODE: message" line';
    if (details.length) {
      try {
        JSON.parse(details.join("\n"));
      } catch {
        return "an error's details, after its first line, must be JSON";
      }
    }
    return null;
  }
  const open = `<untrusted-user-content source="cuddler.${tool}">`;
  const close = "</untrusted-user-content>";
  const fenced = FENCED_RESULTS.includes(tool);
  if (fenced !== body.startsWith("<untrusted-user-content")) {
    return fenced ? `the server returns ${tool} inside ${open} … ${close}` : `the server returns ${tool} as plain JSON`;
  }
  if (fenced && !(body.startsWith(`${open}\n`) && body.endsWith(`\n${close}`))) {
    return `${open} and ${close} go on lines of their own around the JSON`;
  }
  try {
    JSON.parse(fenced ? body.slice(open.length + 1, -(close.length + 1)) : body);
  } catch (e) {
    return `the result is not JSON (${e.message})`;
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** The body of a level-2 section, from its heading to the next level-2 heading. */
export function extractSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

function lineCount(text) {
  if (!text) return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

function listFiles(root, dir = root) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.endsWith(".review") || entry.name === ".DS_Store") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(root, full));
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out.sort();
}

function codeLines(rel, text) {
  // Markdown: only the lines inside fenced code blocks are commands; everything else is prose.
  if (!rel.endsWith(".md")) return text.split(/\r?\n/).map((line, i) => ({ line, no: i + 1 }));
  const result = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) result.push({ line, no: i + 1 });
  });
  return result;
}

/** GitHub's heading anchor: lower-case, punctuation dropped, spaces to hyphens. */
export function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Relative markdown links in `rel` must resolve (and, with #anchor, hit a heading); `within` bounds where they may point. */
function checkLinks(root, rel, text, within, err) {
  const dir = dirname(join(root, rel));
  const bound = resolve(root, within);
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [path, anchor] = target.split("#");
    const abs = path ? resolve(dir, path) : join(root, rel);
    if (abs !== bound && !abs.startsWith(bound + sep)) {
      err(rel, `link ${target} leaves ${within === "." ? "the repository" : within}`);
      continue;
    }
    if (!existsSync(abs)) {
      err(rel, `link ${target} does not resolve`);
      continue;
    }
    if (anchor && abs.endsWith(".md")) {
      const slugs = readFileSync(abs, "utf8")
        .split(/\r?\n/)
        .filter((line) => /^#{1,6}\s/.test(line))
        .map((line) => githubSlug(line.replace(/^#{1,6}\s+/, "")));
      if (!slugs.includes(anchor)) err(rel, `link ${target}: no heading with the anchor #${anchor}`);
    }
  }
}

/** Width and height of a PNG image, or null for any other format. */
function pngSize(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function compareSets(err, file, label, listed, actual) {
  const seen = new Set();
  for (const name of listed) {
    if (seen.has(name)) err(file, `${label} lists "${name}" more than once`);
    seen.add(name);
    if (!actual.includes(name)) err(file, `${label} lists "${name}", which is not a skill directory`);
  }
  for (const name of actual) if (!seen.has(name)) err(file, `${label} does not list the skill "${name}"`);
}

// ── validation ───────────────────────────────────────────────────────────────

export function validate(root) {
  const errors = [];
  const passed = [];
  const err = (file, message) => errors.push({ file, message });
  const group = (label, fn) => {
    const before = errors.length;
    fn();
    if (errors.length === before) passed.push(label);
  };
  const exists = (rel) => existsSync(join(root, rel));
  const read = (rel) => readFileSync(join(root, rel), "utf8");
  const readJson = (rel) => {
    if (!exists(rel)) return null;
    try {
      return JSON.parse(read(rel));
    } catch (e) {
      err(rel, `invalid JSON: ${e.message}`);
      return null;
    }
  };

  group("required files are present", () => {
    for (const rel of REQUIRED_FILES) if (!exists(rel)) err(rel, "required file is missing");
  });

  let version = "";
  group("VERSION is x.y.z", () => {
    version = exists("VERSION") ? read("VERSION").trim() : "";
    if (!/^\d+\.\d+\.\d+$/.test(version)) err("VERSION", `must hold one x.y.z version, found "${version}"`);
  });

  // Skills
  const skills = [];
  group("skills/ holds only skill directories", () => {
    if (!exists("skills")) {
      err("skills", "the skills/ directory is missing");
      return;
    }
    for (const entry of readdirSync(join(root, "skills"), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory()) err(`skills/${entry.name}`, "only skill directories may live in skills/");
      else skills.push(entry.name);
    }
    skills.sort();
    if (!skills.length) err("skills", "no skills found");
  });

  const hardRules = new Map();
  const descriptions = new Map();
  group(`every SKILL.md: ${SKILL_PREFIX} prefix, frontmatter, description rules, ≤ ${LIMITS.skillLinesMax} lines`, () => {
    for (const name of skills) {
      const rel = `skills/${name}/SKILL.md`;
      if (!exists(rel)) {
        err(rel, "missing SKILL.md");
        continue;
      }
      const text = read(rel);
      const lines = lineCount(text);
      if (lines > LIMITS.skillLinesMax) err(rel, `${lines} lines; the limit is ${LIMITS.skillLinesMax} — move detail into references/`);
      if (!NAME_RE.test(name) || name.length > LIMITS.nameMax) {
        err(rel, `directory name "${name}" must be lowercase letters, digits and single hyphens, at most ${LIMITS.nameMax} characters`);
      }
      if (!name.startsWith(SKILL_PREFIX)) {
        err(rel, `directory name "${name}" must start with "${SKILL_PREFIX}" so a flat install can't collide with another vendor's skill`);
      }
      let fm;
      try {
        fm = parseFrontmatter(text).data;
      } catch (e) {
        err(rel, e.message);
        continue;
      }
      for (const key of Object.keys(fm)) {
        if (!ALLOWED_KEYS.includes(key)) err(rel, `frontmatter key "${key}" is not allowed (allowed: ${ALLOWED_KEYS.join(", ")})`);
      }
      if ("license" in fm && fm.license !== "MIT") err(rel, `frontmatter license must be "MIT" (the repository's license), found "${fm.license}"`);
      if (fm.name !== name) err(rel, `name "${fm.name ?? ""}" must equal the directory name "${name}"`);
      const description = fm.description;
      if (typeof description !== "string" || !description.trim()) {
        err(rel, "description is missing");
      } else {
        descriptions.set(name, description);
        if (description.length > LIMITS.descriptionMax) err(rel, `description is ${description.length} characters; the limit is ${LIMITS.descriptionMax}`);
        if (!description.includes("Use when")) err(rel, 'description must contain "Use when"');
        if (!description.includes("NOT for")) err(rel, 'description must contain "NOT for"');
      }
      const rules = extractSection(text, HARD_RULES_HEADING);
      if (!rules) {
        err(rel, `missing the "${HARD_RULES_HEADING}" section`);
      } else {
        hardRules.set(name, rules);
        for (const phrase of RULE_PHRASES) if (!rules.includes(phrase)) err(rel, `the Hard rules must keep the phrase "${phrase}"`);
      }
    }
  });

  group("the Hard rules block is identical in every skill", () => {
    const variants = new Map();
    for (const [name, text] of hardRules) variants.set(text, [...(variants.get(text) ?? []), name]);
    if (variants.size <= 1) return;
    const [canonical, owners] = [...variants.entries()].sort((a, b) => b[1].length - a[1].length || a[1][0].localeCompare(b[1][0]))[0];
    const canonicalLines = canonical.split("\n");
    for (const [text, names] of variants) {
      if (text === canonical) continue;
      const lines = text.split("\n");
      const at = lines.findIndex((line, i) => line !== canonicalLines[i]);
      for (const name of names) {
        err(`skills/${name}/SKILL.md`, `Hard rules differ from ${owners.join(", ")} (first difference in line ${at + 1} of the section); copy the block verbatim`);
      }
    }
  });

  group("skill files: references and scripts resolve, no orphans, no ../ paths", () => {
    for (const name of skills) {
      const base = `skills/${name}`;
      if (!exists(`${base}/SKILL.md`)) continue;
      const skillText = read(`${base}/SKILL.md`);
      for (const entry of readdirSync(join(root, base))) {
        if (entry.startsWith(".")) continue;
        if (!SKILL_ENTRIES.has(entry)) err(`${base}/${entry}`, `unexpected entry; a skill holds only ${[...SKILL_ENTRIES].join(", ")}`);
      }
      const files = listFiles(root, join(root, base));
      for (const rel of files) {
        const inSkill = rel.slice(base.length + 1);
        if ((inSkill.startsWith("references/") || inSkill.startsWith("scripts/")) && !skillText.includes(inSkill)) {
          err(rel, `orphan: ${base}/SKILL.md never mentions ${inSkill}`);
        }
        if (inSkill.startsWith("references/") && !inSkill.endsWith(".md")) err(rel, "references/ may hold only .md files");
        if (!rel.endsWith(".md")) continue;
        const text = read(rel);
        text.split(/\r?\n/).forEach((line, i) => {
          if (/(^|[^.])\.\.\//.test(line)) err(rel, `line ${i + 1}: a skill must be self-contained — no ../ paths`);
        });
        checkLinks(root, rel, text, base, err);
      }
      for (const match of skillText.matchAll(/\b((?:references|scripts)\/[A-Za-z0-9._-]+)/g)) {
        if (!exists(`${base}/${match[1]}`)) err(`${base}/SKILL.md`, `mentions ${match[1]}, which does not exist`);
      }
    }
  });

  group("skills mention only skills that exist", () => {
    for (const name of skills) {
      const rel = `skills/${name}/SKILL.md`;
      if (!exists(rel)) continue;
      const texts = [descriptions.get(name) ?? "", read(rel)];
      for (const text of texts) {
        for (const match of text.matchAll(/\(use ([a-z0-9-]+)(?: or ([a-z0-9-]+))?\)/g)) {
          for (const other of match.slice(1).filter(Boolean)) if (!skills.includes(other)) err(rel, `refers to a skill "${other}" that does not exist`);
        }
        for (const match of text.matchAll(/the `([a-z0-9-]+)` (?:skill|workflow)/g)) {
          if (!skills.includes(match[1])) err(rel, `refers to a skill "${match[1]}" that does not exist`);
        }
      }
    }
  });

  const skillText = listFiles(root).filter((rel) => rel.startsWith("skills/") && TEXT_EXT.test(rel));
  const skillMarkdown = skillText.filter((rel) => rel.endsWith(".md"));

  group("skills name only real Cuddler MCP tools", () => {
    for (const rel of skillMarkdown) {
      read(rel).split(/\r?\n/).forEach((line, i) => {
        for (const match of line.matchAll(/`([a-z_]+)`/g)) {
          if (TOOLISH.test(match[1]) && !MCP_TOOLS.includes(match[1])) {
            err(rel, `line ${i + 1}: \`${match[1]}\` is not a Cuddler MCP tool (${MCP_TOOLS.join(", ")})`);
          }
        }
      });
    }
  });

  group("public text and skill scripts: no command-line tool, no third-party keys, no fixed prices", () => {
    const publicDocs = ["README.md", "INSTALL.md", "INSTALL_FOR_AGENTS.md", CLAWHUB_README].filter(exists);
    for (const rel of [...skillText, ...publicDocs]) {
      const text = rel === "README.md" || rel === CLAWHUB_README ? withoutBlocks(read(rel)) : read(rel);
      // Prices only in prose: in a script, $1 is an argument.
      const prose = rel.endsWith(".md");
      text.split(/\r?\n/).forEach((line, i) => {
        if (CLI_COMMAND.test(line)) err(rel, `line ${i + 1}: a command-line instruction (\`${CLI_COMMAND.exec(line)[0]}\`); the public skills use the Cuddler MCP tools`);
        if (THIRD_PARTY_KEYS.test(line)) err(rel, `line ${i + 1}: mentions a third-party provider key; keep the public skills on Cuddler only`);
        if (prose && FIXED_PRICE.test(line)) err(rel, `line ${i + 1}: a fixed price (${FIXED_PRICE.exec(line)[0]}); prices come from the tools at runtime, public figures from claims.json`);
      });
    }
  });

  group("skills and the ClawHub README don't sell credits, plans or upgrades", () => {
    for (const rel of [...skillText, CLAWHUB_README].filter(exists)) {
      (rel === CLAWHUB_README ? withoutBlocks(read(rel)) : read(rel)).split(/\r?\n/).forEach((line, i) => {
        const match = UPSELL.exec(line);
        if (match) err(rel, `line ${i + 1}: "${match[0]}" sells credits or plans; a skill may say what the plan doesn't include, but may not sell credits or plans, promote upgrades or link to a page that takes payment (OpenAI plugin directory rules)`);
      });
    }
  });

  // Manifests
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const claudePlugin = readJson(".claude-plugin/plugin.json");
  const codexPlugin = readJson(".codex-plugin/plugin.json");
  const cursorPlugin = readJson(".cursor-plugin/plugin.json");
  const openclawPlugin = readJson("openclaw.plugin.json");
  const agentsMarketplace = readJson(".agents/plugins/marketplace.json");
  const mcpConfig = readJson(".mcp.json");
  const claims = readJson("claims.json");

  group(".claude-plugin/marketplace.json lists exactly the skills", () => {
    const rel = ".claude-plugin/marketplace.json";
    if (!marketplace) return;
    const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
    if (plugins.length !== 1) err(rel, `expected exactly one plugin, found ${plugins.length}`);
    const plugin = plugins[0] ?? {};
    if (plugin.source !== "./") err(rel, 'plugins[0].source must be "./"');
    if (plugin.strict === false) {
      err(rel, "plugins[0].strict must not be false: with .claude-plugin/plugin.json present, a strict:false entry that declares skills fails to load");
    }
    const names = [];
    for (const entry of Array.isArray(plugin.skills) ? plugin.skills : []) {
      const match = /^\.\/skills\/([^/]+)\/?$/.exec(String(entry));
      if (match) names.push(match[1]);
      else err(rel, `skills entry "${entry}" must look like ./skills/<name>`);
    }
    compareSets(err, rel, "plugins[0].skills", names, skills);
  });

  group("plugin manifests point at skills/ and .mcp.json, share one name, MIT and this repository", () => {
    const name = marketplace?.plugins?.[0]?.name;
    for (const [rel, manifest] of [
      [".claude-plugin/plugin.json", claudePlugin],
      [".codex-plugin/plugin.json", codexPlugin],
      [".cursor-plugin/plugin.json", cursorPlugin],
    ]) {
      if (!manifest) continue;
      if (!manifest.name) err(rel, "name is missing");
      else if (name && manifest.name !== name) err(rel, `name "${manifest.name}" differs from the marketplace plugin "${name}"`);
      if (manifest.license !== "MIT") err(rel, `license must be "MIT", found "${manifest.license ?? "missing"}"`);
      if (manifest.repository !== PUBLIC_REPOSITORY) err(rel, `repository must be ${PUBLIC_REPOSITORY}`);
      // Claude Code reads .mcp.json from the plugin root on its own; Codex and Cursor are told where it is.
      if (rel !== ".claude-plugin/plugin.json" && manifest.mcpServers !== "./.mcp.json") {
        err(rel, 'mcpServers must be "./.mcp.json", so the plugin brings the Cuddler MCP server along');
      }
      const declared = manifest.skills;
      if (declared === undefined) {
        if (rel !== ".claude-plugin/plugin.json") err(rel, 'must declare "skills": "./skills/"');
      } else if (typeof declared === "string") {
        if (declared.replace(/\/$/, "") !== "./skills") err(rel, `skills must be "./skills/", found "${declared}"`);
      } else if (Array.isArray(declared)) {
        const names = declared.map((entry) => /^\.\/skills\/([^/]+)\/?$/.exec(String(entry))?.[1] ?? `?${entry}`);
        compareSets(err, rel, "skills", names, skills);
      } else {
        err(rel, "skills must be a path or a list of paths");
      }
      const iface = manifest.interface ?? {};
      for (const key of ["composerIcon", "logo"]) {
        for (const value of [manifest[key], iface[key]]) {
          if (typeof value === "string" && value.startsWith("./") && !exists(value.slice(2))) err(rel, `${key} ${value} does not exist`);
        }
      }
    }
  });

  group("the Codex manifest and marketplace meet the OpenAI plugin directory rules", () => {
    const rel = ".codex-plugin/plugin.json";
    if (codexPlugin) {
      const iface = codexPlugin.interface ?? {};
      const openai = codexPlugin.extensions?.["com.openai"] ?? {};
      if (!codexPlugin.author?.name) err(rel, "author.name is required in the Codex format");
      if (typeof codexPlugin.description !== "string" || !codexPlugin.description.trim()) err(rel, "description is required in the Codex format");
      else if (codexPlugin.description.length > PACKAGE_DESCRIPTION_MAX) err(rel, `description is ${codexPlugin.description.length} characters; the limit is ${PACKAGE_DESCRIPTION_MAX}`);
      for (const [key, url] of [["homepage", codexPlugin.homepage], ["author.url", codexPlugin.author?.url]]) {
        if (url !== undefined && !/^https:\/\/[^/@\s]+(?:\/\S*)?$/.test(String(url))) err(rel, `${key} must be an https URL without credentials`);
      }
      for (const skill of skills) {
        const identity = `${codexPlugin.name}:${skill}`;
        if (identity.length > SKILL_IDENTITY_MAX) err(rel, `"${identity}" is ${identity.length} characters; plugin and skill name together may have ${SKILL_IDENTITY_MAX}`);
      }
      for (const key of ["apps", "hooks"]) {
        if (key in codexPlugin || key in openai) err(rel, `"${key}" can't be in a package for the OpenAI plugin directory`);
      }
      for (const file of [".app.json", "hooks/hooks.json"]) {
        if (exists(file)) err(file, "app references and lifecycle hooks can't be in a package for the OpenAI plugin directory");
      }
      const text = (key, max) => {
        const value = iface[key];
        if (typeof value !== "string" || !value.trim()) err(rel, `interface.${key} is required`);
        else if (value.length > max) err(rel, `interface.${key} is ${value.length} characters; the limit is ${max}`);
      };
      text("displayName", CODEX_LISTING.displayNameMax);
      text("shortDescription", CODEX_LISTING.shortDescriptionMax);
      text("longDescription", CODEX_LISTING.longDescriptionMax);
      text("developerName", CODEX_LISTING.developerNameMax);
      text("category", CODEX_LISTING.categoryMax);
      if (typeof iface.category === "string" && iface.category.trim() && !LISTING_CATEGORIES.includes(iface.category)) {
        err(rel, `interface.category "${iface.category}" is not a directory category (${LISTING_CATEGORIES.join(", ")})`);
      }
      if (typeof iface.shortDescription === "string" && /[\r\n]/.test(iface.shortDescription)) err(rel, "interface.shortDescription must fit on one line");
      const capabilities = iface.capabilities;
      if (!Array.isArray(capabilities)) {
        err(rel, "interface.capabilities must be a list ([] when there are none)");
      } else {
        if (capabilities.length > CODEX_LISTING.capabilitiesMax) err(rel, `interface.capabilities has ${capabilities.length} entries; the limit is ${CODEX_LISTING.capabilitiesMax}`);
        for (const entry of capabilities) {
          if (typeof entry !== "string" || !entry.trim() || entry.length > CODEX_LISTING.capabilityMax) {
            err(rel, `interface.capabilities: "${entry}" must be 1–${CODEX_LISTING.capabilityMax} characters`);
          }
        }
      }
      for (const key of LISTING_URLS) {
        const url = iface[key];
        if (typeof url !== "string" || !url) err(rel, `interface.${key} is required for a plugin with an MCP server`);
        else if (!/^https:\/\/[^/@\s]+(?:\/\S*)?$/.test(url) || url.length > CODEX_LISTING.urlMax) {
          err(rel, `interface.${key} must be an https URL without credentials, at most ${CODEX_LISTING.urlMax} characters`);
        }
      }
      const prompts = iface.defaultPrompt;
      if (!Array.isArray(prompts) || !prompts.length) {
        err(rel, `interface.defaultPrompt must list 1–${CODEX_LISTING.promptsMax} starter prompts`);
      } else {
        if (prompts.length > CODEX_LISTING.promptsMax) err(rel, `interface.defaultPrompt has ${prompts.length} prompts; the limit is ${CODEX_LISTING.promptsMax}`);
        if (new Set(prompts).size !== prompts.length) err(rel, "interface.defaultPrompt repeats a prompt");
        for (const prompt of prompts) {
          if (typeof prompt !== "string" || !prompt.trim() || prompt.length > CODEX_LISTING.promptMax || /[\r\n]/.test(prompt)) {
            err(rel, `interface.defaultPrompt: "${prompt}" must be one line of 1–${CODEX_LISTING.promptMax} characters`);
          } else if (prompt.includes("@")) {
            err(rel, `interface.defaultPrompt: "${prompt}" may not @-mention anything`);
          }
        }
      }
      const listing = [
        ["description", codexPlugin.description],
        ["interface.shortDescription", iface.shortDescription],
        ["interface.longDescription", iface.longDescription],
        ...(Array.isArray(prompts) ? prompts.map((prompt) => ["interface.defaultPrompt", prompt]) : []),
      ];
      for (const [key, value] of listing) {
        if (typeof value === "string" && PROMOTION.test(value)) {
          err(rel, `${key} mentions "${PROMOTION.exec(value)[0]}"; directory listings may not advertise prices, subscriptions, upgrades or promotions`);
        }
      }
      for (const key of ["composerIcon", "logo"]) {
        const value = iface[key];
        if (typeof value !== "string" || !value.startsWith("./")) {
          err(rel, `interface.${key} is required, as a ./ path`);
          continue;
        }
        const file = value.slice(2);
        if (!exists(file)) continue; // reported with the other manifests
        if (!/\.(?:png|jpe?g|webp|svg)$/i.test(file)) err(rel, `interface.${key} must be a PNG, JPEG, WebP or SVG file`);
        const bytes = readFileSync(join(root, file));
        if (bytes.length > CODEX_LISTING.iconBytesMax) err(rel, `interface.${key} is ${bytes.length} bytes; the limit is 5 MiB`);
        const size = pngSize(bytes);
        if (size && (size.width !== size.height || size.width < CODEX_LISTING.iconMinPx || size.width > CODEX_LISTING.iconMaxPx)) {
          err(rel, `interface.${key} is ${size.width}×${size.height}; icons must be square, ${CODEX_LISTING.iconMinPx}–${CODEX_LISTING.iconMaxPx} px`);
        }
      }
      if ("onboardingSkill" in openai) {
        const match = /^\.\/skills\/([^/]+)\/SKILL\.md$/.exec(String(openai.onboardingSkill));
        if (!match || !skills.includes(match[1])) {
          err(rel, `extensions.com.openai.onboardingSkill "${openai.onboardingSkill}" must be ./skills/<skill>/SKILL.md of a skill in this repository`);
        }
      }
    }

    const marketRel = ".agents/plugins/marketplace.json";
    if (agentsMarketplace) {
      // Codex reads this file before .claude-plugin/marketplace.json; a different name would change the plugin id.
      if (marketplace && agentsMarketplace.name !== marketplace.name) {
        err(marketRel, `name "${agentsMarketplace.name ?? ""}" differs from .claude-plugin/marketplace.json "${marketplace.name ?? ""}"; Codex would install the plugin under another id`);
      }
      if (codexPlugin && agentsMarketplace.interface?.displayName !== codexPlugin.interface?.displayName) {
        err(marketRel, "interface.displayName must match interface.displayName in .codex-plugin/plugin.json");
      }
      const plugins = Array.isArray(agentsMarketplace.plugins) ? agentsMarketplace.plugins : [];
      if (plugins.length !== 1) err(marketRel, `expected exactly one plugin, found ${plugins.length}`);
      const entry = plugins[0] ?? {};
      const pluginName = marketplace?.plugins?.[0]?.name;
      if (pluginName && entry.name !== pluginName) err(marketRel, `plugins[0].name "${entry.name ?? ""}" differs from the plugin "${pluginName}"`);
      const path = typeof entry.source === "string" ? entry.source : entry.source?.source === "local" ? entry.source.path : undefined;
      if (path !== "./") err(marketRel, 'plugins[0].source must be the repository root: {"source": "local", "path": "./"}');
      if (entry.policy?.installation !== "AVAILABLE") err(marketRel, 'plugins[0].policy.installation must be "AVAILABLE"');
      if (entry.policy?.authentication !== "ON_INSTALL") err(marketRel, 'plugins[0].policy.authentication must be "ON_INSTALL", so signing in is part of installing');
      if (codexPlugin && entry.category !== codexPlugin.interface?.category) {
        err(marketRel, "plugins[0].category must match interface.category in .codex-plugin/plugin.json");
      }
    }
  });

  group("versions match VERSION everywhere", () => {
    if (!version) return;
    const check = (rel, where, value) => {
      if (value !== version) err(rel, `${where} is "${value ?? "missing"}"; VERSION is ${version}`);
    };
    if (marketplace) {
      check(".claude-plugin/marketplace.json", "plugins[0].version", marketplace.plugins?.[0]?.version);
      if (marketplace.metadata && "version" in marketplace.metadata) check(".claude-plugin/marketplace.json", "metadata.version", marketplace.metadata.version);
    }
    if (claudePlugin) check(".claude-plugin/plugin.json", "version", claudePlugin.version);
    if (codexPlugin) check(".codex-plugin/plugin.json", "version", codexPlugin.version);
    if (cursorPlugin) check(".cursor-plugin/plugin.json", "version", cursorPlugin.version);
    if (openclawPlugin) check("openclaw.plugin.json", "version", openclawPlugin.version);
    if (exists("CHANGELOG.md")) {
      const first = /^## \[?(\d+\.\d+\.\d+)\]?/m.exec(read("CHANGELOG.md"));
      if (!first) err("CHANGELOG.md", "no version heading such as ## [x.y.z]");
      else check("CHANGELOG.md", "the newest entry", first[1]);
    }
  });

  group(".mcp.json declares the cuddler server at claims.json mcp.url, with the plugin source header for every host", () => {
    const rel = ".mcp.json";
    if (!mcpConfig) return;
    const servers = mcpConfig.mcpServers && typeof mcpConfig.mcpServers === "object" ? Object.keys(mcpConfig.mcpServers) : [];
    if (servers.length !== 1 || servers[0] !== MCP_SERVER) err(rel, `must declare exactly one server, "${MCP_SERVER}"; found ${servers.join(", ") || "none"}`);
    const server = mcpConfig.mcpServers?.[MCP_SERVER] ?? {};
    if (server.type !== "http") err(rel, `${MCP_SERVER}.type must be "http"`);
    const url = claims ? lookup(claims, "mcp.url") : undefined;
    if (url && server.url !== url) err(rel, `${MCP_SERVER}.url is "${server.url ?? "missing"}"; claims.json mcp.url is "${url}"`);
    for (const key of ["headers", "http_headers"]) {
      if (server[key]?.[SOURCE_HEADER.name] !== SOURCE_HEADER.value) {
        err(rel, `${MCP_SERVER}.${key} must set ${SOURCE_HEADER.name}: ${SOURCE_HEADER.value} (Claude Code and Cursor send headers, Codex sends http_headers)`);
      }
    }
    if (JSON.stringify(server.headers ?? {}) !== JSON.stringify(server.http_headers ?? {})) {
      err(rel, `${MCP_SERVER}.headers and ${MCP_SERVER}.http_headers must be identical, so every host sends the same headers`);
    }
  });

  group("openclaw.plugin.json loads the skills and the cuddler server, signed in with OAuth", () => {
    const rel = "openclaw.plugin.json";
    if (!openclawPlugin) return;
    const pluginName = marketplace?.plugins?.[0]?.name;
    if (pluginName && openclawPlugin.id !== pluginName) err(rel, `id "${openclawPlugin.id ?? ""}" differs from the plugin "${pluginName}"`);
    const displayName = codexPlugin?.interface?.displayName;
    if (displayName && openclawPlugin.name !== displayName) err(rel, `name "${openclawPlugin.name ?? ""}" differs from the display name "${displayName}"`);
    if (typeof openclawPlugin.description !== "string" || !openclawPlugin.description.trim()) err(rel, "description is required: OpenClaw and ClawHub show it");
    else if (openclawPlugin.description.length > PACKAGE_DESCRIPTION_MAX) err(rel, `description is ${openclawPlugin.description.length} characters; the limit is ${PACKAGE_DESCRIPTION_MAX}`);
    if (JSON.stringify(openclawPlugin.skills) !== JSON.stringify(["./skills"])) err(rel, 'skills must be ["./skills"]');
    const schema = openclawPlugin.configSchema;
    if (!schema || typeof schema !== "object" || schema.type !== "object") err(rel, 'configSchema is required by OpenClaw: { "type": "object", ... }');
    for (const key of ["extensions", "providers", "channels", "contracts"]) {
      if (key in openclawPlugin) err(rel, `"${key}" declares code; this plugin is skills and an MCP server only`);
    }
    const servers = openclawPlugin.mcpServers && typeof openclawPlugin.mcpServers === "object" ? Object.keys(openclawPlugin.mcpServers) : [];
    if (servers.length !== 1 || servers[0] !== MCP_SERVER) err(rel, `mcpServers must declare exactly one server, "${MCP_SERVER}"; found ${servers.join(", ") || "none"}`);
    const server = openclawPlugin.mcpServers?.[MCP_SERVER] ?? {};
    const url = claims ? lookup(claims, "mcp.url") : undefined;
    if (url && server.url !== url) err(rel, `${MCP_SERVER}.url is "${server.url ?? "missing"}"; claims.json mcp.url is "${url}"`);
    if (server.transport !== "streamable-http") err(rel, `${MCP_SERVER}.transport must be "streamable-http"; OpenClaw falls back to SSE without it`);
    if (server.auth !== "oauth") err(rel, `${MCP_SERVER}.auth must be "oauth"; OpenClaw signs in only to servers marked that way`);
    if (server.headers?.[SOURCE_HEADER.name] !== SOURCE_HEADER.value || Object.keys(server.headers ?? {}).length !== 1) {
      err(rel, `${MCP_SERVER}.headers must hold only ${SOURCE_HEADER.name}: ${SOURCE_HEADER.value}, like .mcp.json`);
    }
    if (!Number.isInteger(server.requestTimeoutMs) || server.requestTimeoutMs < 60000) {
      err(rel, `${MCP_SERVER}.requestTimeoutMs must be a whole number of milliseconds, at least 60000: create_image answers when the image is done`);
    }
    for (const key of ["command", "args", "env", "cwd"]) if (key in server) err(rel, `${MCP_SERVER}.${key}: the Cuddler server is remote, not a local process`);

    const commands = claims ? lookup(claims, "install.openclaw") : undefined;
    if (!Array.isArray(commands)) return; // reported with the other claims
    const want = (line, why) => {
      if (!commands.includes(line)) err("claims.json", `install.openclaw must include \`${line}\` (${why})`);
    };
    want(`openclaw plugins install clawhub:${CLAWHUB_PACKAGE}`, "the package on ClawHub");
    want(`openclaw mcp login ${MCP_SERVER}`, "the terminal sign-in");
    const add = commands.find((line) => line.startsWith(`openclaw mcp add ${MCP_SERVER} `));
    if (!add) {
      err("claims.json", `install.openclaw must add the server for a terminal sign-in: \`openclaw mcp add ${MCP_SERVER} --url … --auth oauth\``);
    } else {
      const flags = [
        `--url ${url}`,
        "--transport streamable-http",
        "--auth oauth",
        `--header ${SOURCE_HEADER.name}=${SOURCE_HEADER.value}`,
        `--timeout ${Math.round((server.requestTimeoutMs ?? 0) / 1000)}`,
      ];
      for (const flag of flags) if (!` ${add} `.includes(` ${flag} `)) err("claims.json", `install.openclaw: \`openclaw mcp add\` must carry ${flag}, as openclaw.plugin.json declares the server`);
    }
  });

  group("claims.json is complete and the README matches it", () => {
    if (!claims) return;
    for (const key of REQUIRED_CLAIMS) {
      const value = lookup(claims, key);
      if (value === undefined) {
        err("claims.json", `"${key}" is missing`);
        continue;
      }
      if (key !== "mcp.url") {
        try {
          render(value);
        } catch (e) {
          err("claims.json", `"${key}": ${e.message}`);
        }
      }
    }
    if (!/^https:\/\/mcp\.cuddler\.ai\//.test(String(lookup(claims, "mcp.url") ?? ""))) err("claims.json", "mcp.url must be on https://mcp.cuddler.ai/");
    for (const [name, link] of Object.entries(claims.links ?? {})) {
      if (!link?.url?.startsWith("https://cuddler.ai/")) err("claims.json", `links.${name}.url must start with https://cuddler.ai/`);
      else if (!link.url.includes(README_UTM)) err("claims.json", `links.${name}.url must carry ${README_UTM}`);
    }
    if (!exists("README.md")) return;
    const blocks = readmeBlocks(read("README.md"));
    for (const key of REQUIRED_README_BLOCKS) if (!blocks.has(key)) err("README.md", `missing the generated block <!-- claims:${key} -->`);
    for (const [key, content] of blocks) {
      const value = lookup(claims, key);
      if (value === undefined) {
        err("README.md", `block "${key}" has no value in claims.json`);
        continue;
      }
      let expected;
      try {
        expected = render(value);
      } catch (e) {
        err("README.md", `block "${key}": ${e.message}`);
        continue;
      }
      if (content !== expected) err("README.md", `block "${key}" differs from claims.json; run \`node scripts/claims.mjs\``);
    }
    for (const match of withoutBlocks(read("README.md")).matchAll(/https?:\/\/(?:www\.)?cuddler\.ai[^\s)>"]*/g)) {
      if (!match[0].includes("utm_source=github")) err("README.md", `${match[0]} needs the GitHub attribution (${README_UTM}); put it in claims.json links`);
    }
    if (!exists(CLAWHUB_README)) return;
    const clawhub = read(CLAWHUB_README);
    const clawhubBlocks = readmeBlocks(clawhub);
    for (const key of REQUIRED_CLAWHUB_BLOCKS) if (!clawhubBlocks.has(key)) err(CLAWHUB_README, `missing the generated block <!-- claims:${key} -->`);
    for (const [key, content] of clawhubBlocks) {
      const value = lookup(claims, key);
      let expected;
      try {
        expected = value === undefined ? undefined : render(value);
      } catch {
        expected = undefined;
      }
      if (expected === undefined) err(CLAWHUB_README, `block "${key}" has no renderable value in claims.json`);
      else if (content !== expected) err(CLAWHUB_README, `block "${key}" differs from claims.json; run \`node scripts/claims.mjs\``);
    }
    for (const match of withoutBlocks(clawhub).matchAll(/https?:\/\/(?:www\.)?cuddler\.ai[^\s)>"]*/g)) {
      if (!match[0].includes(CLAWHUB_UTM)) err(CLAWHUB_README, `${match[0]} needs the ClawHub attribution (${CLAWHUB_UTM})`);
    }
  });

  group("README and INSTALL list exactly the skills", () => {
    if (exists("README.md")) {
      const text = read("README.md");
      const linked = [...text.matchAll(/\]\(\.?\/?skills\/([a-z0-9-]+)(?:\/[^)]*)?\)/g)].map((m) => m[1]);
      compareSets(err, "README.md", "the skills table (links to skills/<name>/)", [...new Set(linked)], skills);
      for (const match of text.matchAll(/\bskills\/([a-z0-9-]+)\//g)) {
        if (!skills.includes(match[1])) err("README.md", `mentions skills/${match[1]}/, which does not exist`);
      }
    }
    if (exists(CLAWHUB_README)) {
      const rows = [...read(CLAWHUB_README).matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]);
      compareSets(err, CLAWHUB_README, "the skills table", rows, skills);
    }
    if (exists("INSTALL.md")) {
      const named = [...read("INSTALL.md").matchAll(/\/cuddler:([a-z0-9-]+)/g)].map((m) => m[1]);
      compareSets(err, "INSTALL.md", "the /cuddler:<skill> list", [...new Set(named)], skills);
    }
  });

  group("eval cases: prompt and graders present, real tools only, mocks in the server's formats for every tool, every skill covered", () => {
    if (!exists("evals")) return;
    const cases = readdirSync(join(root, "evals"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP_DIRS.has(d.name) && d.name !== "mocks")
      .map((d) => d.name)
      .sort();
    const checkMocks = (dir) => {
      if (!exists(dir)) return [];
      const tools = [];
      for (const entry of readdirSync(join(root, dir))) {
        if (entry.startsWith(".") || entry.startsWith("_")) continue;
        const tool = entry.replace(/\.md$/, "");
        if (!entry.endsWith(".md") || !MCP_TOOLS.includes(tool)) {
          err(`${dir}/${entry}`, `a mock must be <tool>.md for a Cuddler MCP tool`);
          continue;
        }
        const problem = mockBodyProblem(tool, read(`${dir}/${entry}`));
        if (problem) err(`${dir}/${entry}`, problem);
        tools.push(tool);
      }
      return tools;
    };
    const suiteMocks = checkMocks(`evals/mocks/${MCP_SERVER}`);
    for (const tool of MCP_TOOLS) {
      if (!suiteMocks.includes(tool)) err(`evals/mocks/${MCP_SERVER}`, `no suite mock for ${tool}: without one the tool is unavailable in eval runs`);
    }
    const listingFile = `evals/mocks/${MCP_SERVER}/_tools.json`;
    if (!exists(listingFile)) {
      err(listingFile, "missing: save the server's tools/list here so eval runs show the real tool descriptions and schemas");
    } else {
      let listing = null;
      try {
        listing = JSON.parse(read(listingFile));
      } catch (e) {
        err(listingFile, `not JSON (${e.message})`);
      }
      if (listing) for (const problem of toolListProblems(listing)) err(listingFile, problem);
    }
    for (const id of cases) {
      const base = `evals/${id}`;
      if (!exists(`${base}/prompt.md`)) {
        err(base, "an eval case needs a prompt.md");
        continue;
      }
      const keys = frontmatterEntries(read(`${base}/prompt.md`));
      if (!keys) err(`${base}/prompt.md`, "needs YAML frontmatter");
      else for (const key of keys.keys()) if (!EVAL_PROMPT_KEYS.has(key)) err(`${base}/prompt.md`, `frontmatter key "${key}" is not a claude plugin eval field`);
      const graders = exists(`${base}/graders`) ? readdirSync(join(root, base, "graders")).filter((f) => f.endsWith(".md")) : [];
      if (!graders.length) err(base, "an eval case needs at least one graders/*.md");
      for (const g of graders) {
        const entries = frontmatterEntries(read(`${base}/graders/${g}`));
        if (!entries?.get("type")) err(`${base}/graders/${g}`, "a grader needs a type");
        const tool = entries?.get("tool");
        if (tool && tool !== "Skill") {
          const name = tool.startsWith(EVAL_TOOL_PREFIX) ? tool.slice(EVAL_TOOL_PREFIX.length) : null;
          if (!name || !MCP_TOOLS.includes(name)) err(`${base}/graders/${g}`, `tool "${tool}" must be Skill or ${EVAL_TOOL_PREFIX}<a Cuddler MCP tool>`);
        }
      }
      checkMocks(`${base}/mocks/${MCP_SERVER}`);
    }
    if (!exists("evals/README.md")) return;
    const index = read("evals/README.md");
    const listed = [...index.matchAll(/^### ([a-z0-9-]+)\s*$/gm)].map((m) => m[1]);
    for (const id of cases) if (!listed.includes(id)) err("evals/README.md", `the case "${id}" has no "### ${id}" section`);
    for (const id of listed) if (!cases.includes(id)) err("evals/README.md", `lists "${id}", which is not an eval case directory`);
    const covered = new Set();
    for (const match of index.matchAll(/^\*\*Skills:\*\*\s*(.+)$/gm)) {
      for (const raw of match[1].split(",")) {
        const name = raw.trim();
        if (!skills.includes(name)) err("evals/README.md", `a case names a skill "${name}" that does not exist`);
        covered.add(name);
      }
    }
    for (const name of skills) if (!covered.has(name)) err("evals/README.md", `no eval case covers the skill "${name}" (add a "**Skills:** ${name}" line)`);
  });

  group("other docs refer only to real skills", () => {
    for (const rel of ["README.md", "INSTALL_FOR_AGENTS.md", "evals/README.md", "CHANGELOG.md", "CONTRIBUTING.md"]) {
      if (!exists(rel)) continue;
      for (const match of read(rel).matchAll(/\/cuddler:([a-z0-9-]+)/g)) {
        if (!skills.includes(match[1])) err(rel, `mentions /cuddler:${match[1]}, which is not a skill`);
      }
    }
  });

  group("links in the top-level docs resolve", () => {
    for (const rel of ["README.md", "INSTALL.md", "INSTALL_FOR_AGENTS.md", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "evals/README.md", CLAWHUB_README]) {
      if (exists(rel)) checkLinks(root, rel, read(rel), ".", err);
    }
  });

  group("workflows run this validator and pin every action to a commit", () => {
    const dir = ".github/workflows";
    if (!exists(dir)) return;
    const main = `${dir}/validate.yml`;
    if (exists(main) && !read(main).includes("node scripts/validate.mjs")) err(main, "must run `node scripts/validate.mjs`");
    for (const file of readdirSync(join(root, dir)).filter((f) => /\.ya?ml$/.test(f))) {
      read(`${dir}/${file}`).split(/\r?\n/).forEach((line, i) => {
        const use = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line);
        if (use && !use[1].startsWith("./") && !/@[0-9a-f]{40}$/.test(use[1])) err(`${dir}/${file}`, `line ${i + 1}: pin ${use[1]} to a full commit SHA`);
        if (/pull_request_target/.test(line)) err(`${dir}/${file}`, `line ${i + 1}: pull_request_target runs untrusted code with secrets; use pull_request`);
      });
    }
  });

  group("safety lints: no direct API calls, no admin routes or internal addresses, no secrets or email addresses", () => {
    const apiHost = /(?:api|mcp)\.cuddler\.ai/;
    const httpClient = /\b(?:curl|wget|fetch|axios|requests\.\w+|Invoke-WebRequest|urllib|httpie|xh|http\s+(?:get|post|put|delete))\b/i;
    const secrets = [
      [/cud_pat_[A-Za-z0-9_-]{16,}/, "a Cuddler personal access token"],
      [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
      [/\bsk-[A-Za-z0-9_-]{32,}/, "an API secret key"],
      [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
      [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
    ];
    const internal = [
      [/\/api\/admin\b|admin[ _-]secret/i, "an admin route or secret; keep internal operations out of this repo"],
      [/\bgcloud\s+secrets\b/, "a secret store; skills must never fetch secrets"],
      [/feishu\.cn|larksuite\.com/i, "a chat link"],
      [/\bdocs\/(?:design|research|runbook|plans)[\w/-]*/, "a document path from a private repository"],
      [/\b[a-z]+-\d{6}\b/, "a cloud project id"],
    ];
    const email = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
    for (const rel of listFiles(root)) {
      if (LINT_EXEMPT.has(rel) || !TEXT_EXT.test(rel)) continue;
      const text = read(rel);
      for (const { line, no } of codeLines(rel, text)) {
        if (apiHost.test(line) && httpClient.test(line)) {
          err(rel, `line ${no}: calls the API directly; skills reach Cuddler only through the MCP tools`);
        }
      }
      text.split(/\r?\n/).forEach((line, i) => {
        for (const [pattern, what] of internal) if (pattern.test(line)) err(rel, `line ${i + 1}: mentions ${what}`);
        for (const [pattern, what] of secrets) if (pattern.test(line)) err(rel, `line ${i + 1}: looks like ${what}`);
        for (const match of line.matchAll(email)) {
          if (!ALLOWED_EMAILS.has(match[0])) err(rel, `line ${i + 1}: contains an email address (${match[0]})`);
        }
      });
    }
  });

  group("no invisible characters in any text file", () => {
    // Zero-width and direction-changing characters, Unicode tags and variation selectors: an agent reads them, a reviewer doesn't see them.
    const invisible = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\u{1D173}-\u{1D17A}]/u;
    for (const rel of listFiles(root)) {
      if (!TEXT_EXT.test(rel)) continue;
      read(rel).split(/\r?\n/).forEach((line, i) => {
        const match = invisible.exec(line);
        if (match) {
          const code = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
          err(rel, `line ${i + 1}: an invisible character (U+${code}); an agent reads it but a reviewer can't see it`);
        }
      });
    }
  });

  group("skills link only to cuddler.ai, over https", () => {
    const hosts = ["cuddler.ai", "mcp.cuddler.ai"];
    for (const rel of skillText) {
      read(rel).split(/\r?\n/).forEach((line, i) => {
        for (const [, scheme, name] of line.matchAll(/\b(https?):\/\/([A-Za-z0-9.-]+)/gi)) {
          const host = name.toLowerCase().replace(/[.-]+$/, "");
          if (!hosts.includes(host)) err(rel, `line ${i + 1}: links to ${host}; skills link only to ${hosts.join(" and ")}`);
          else if (scheme.toLowerCase() !== "https") err(rel, `line ${i + 1}: ${scheme}://${host} must use https`);
        }
      });
    }
  });

  return { errors, passed, skills, version };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function annotate(file, message) {
  const escape = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return `::error file=${escape(file)}::${escape(message)}`;
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`validate: ${root} is not a directory`);
    process.exit(2);
  }
  const { errors, passed, skills, version } = validate(root);
  for (const label of passed) console.log(`✓ ${label}`);
  for (const { file, message } of errors) {
    console.log(`✗ ${file}: ${message}`);
    if (process.env.GITHUB_ACTIONS === "true") console.log(annotate(file, message));
  }
  console.log(
    errors.length
      ? `\n${errors.length} problem(s) found in ${root}`
      : `\nall checks passed · ${skills.length} skills (${skills.join(", ")}) · version ${version}`,
  );
  process.exit(errors.length ? 1 : 0);
}
