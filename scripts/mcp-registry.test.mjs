// Tests for mcp-registry.mjs, the server.json rules, and for the workflow that publishes server.json.
//   node --test scripts/mcp-registry.test.mjs
// Most red fixtures break one field of a copy of server.json; the last ones copy the repository, like validate.test.mjs.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REGISTRY_NAME, REGISTRY_SCHEMA, serverJsonProblems } from "./mcp-registry.mjs";
import { validate } from "./validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = JSON.parse(readFileSync(join(ROOT, "server.json"), "utf8"));
const MCP_URL = JSON.parse(readFileSync(join(ROOT, "claims.json"), "utf8")).mcp.url;
const EXPECTED = { mcpUrl: MCP_URL, repository: "https://github.com/CuddlerAI/skills", displayName: "Cuddler" };
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/mcp-registry-publish.yml"), "utf8");

/** The problems of server.json after `change` edits a fresh copy of it. */
function problemsAfter(change) {
  const entry = structuredClone(ENTRY);
  change(entry);
  return serverJsonProblems(entry, EXPECTED);
}

function expectProblem(problems, pattern) {
  assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}; got:\n${problems.join("\n") || "(none)"}`);
}

function validateCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "cuddler-registry-test-"));
  try {
    cpSync(ROOT, dir, {
      recursive: true,
      filter: (src) => !src.split(sep).some((part) => [".git", "node_modules", "results", "dist"].includes(part) || part.endsWith(".review")),
    });
    mutate(dir);
    return validate(dir).errors.filter((e) => e.file === "server.json").map((e) => e.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("server.json in this repository follows the registry's rules and names the same server", () => {
  assert.deepEqual(serverJsonProblems(ENTRY, EXPECTED), []);
  assert.equal(ENTRY.name, REGISTRY_NAME);
  assert.equal(ENTRY.$schema, REGISTRY_SCHEMA);
  assert.equal(ENTRY.remotes[0].url, JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8")).mcpServers.cuddler.url);
});

test("the name, the schema and unknown fields", () => {
  expectProblem(problemsAfter((e) => (e.name = "io.github.cuddlerai/cuddler")), /name is "io\.github\.cuddlerai\/cuddler"/);
  expectProblem(problemsAfter((e) => (e.$schema = "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json")), /\$schema/);
  expectProblem(problemsAfter((e) => (e.status = "active")), /"status" is not a server\.json field/);
  assert.deepEqual(serverJsonProblems([], EXPECTED), ["must be a JSON object"]);
});

test("title and description: required, at most 100 characters, the same display name", () => {
  expectProblem(problemsAfter((e) => (e.description = "x".repeat(101))), /description is 101 characters; the registry allows 100/);
  expectProblem(problemsAfter((e) => delete e.description), /description is required/);
  expectProblem(problemsAfter((e) => (e.title = "Cuddler Studio")), /title "Cuddler Studio" differs from the display name "Cuddler"/);
});

test("a version must be a plain x.y.z", () => {
  for (const version of ["^1.0.0", "1.x", "1.0.0-1", "v1.0.0", "", 1]) {
    expectProblem(problemsAfter((e) => (e.version = version)), /use a plain x\.y\.z/);
  }
});

test("the remote is the Cuddler server alone, with no headers or variables", () => {
  expectProblem(problemsAfter((e) => (e.remotes[0].url = "https://mcp.cuddler.ai/sse")), /remotes\[0\]\.url is "https:\/\/mcp\.cuddler\.ai\/sse"/);
  expectProblem(problemsAfter((e) => (e.remotes[0].type = "sse")), /must be "streamable-http"/);
  expectProblem(problemsAfter((e) => (e.remotes[0].headers = [{ name: "X-Cuddler-Source", value: "plugin" }])), /the entry sends no headers/);
  expectProblem(problemsAfter((e) => (e.remotes[0].variables = { region: { description: "Region" } })), /takes no variables/);
  expectProblem(problemsAfter((e) => e.remotes.push({ type: "sse", url: "https://mcp.cuddler.ai/sse" })), /exactly one server/);
  expectProblem(problemsAfter((e) => (e.packages = [])), /remote only/);
});

test("the website and the icons stay on cuddler.ai over https; the repository is this one", () => {
  expectProblem(problemsAfter((e) => (e.websiteUrl = "http://cuddler.ai/mcp")), /websiteUrl must be an https page on cuddler\.ai/);
  expectProblem(problemsAfter((e) => (e.icons[0].src = "https://raw.githubusercontent.com/CuddlerAI/skills/main/assets/logo.png")), /icons\[0\]\.src must be an https address on cuddler\.ai/);
  expectProblem(problemsAfter((e) => (e.icons[0].mimeType = "image/gif")), /icons\[0\]\.mimeType/);
  expectProblem(problemsAfter((e) => (e.icons[1].sizes = ["192"])), /icons\[1\]\.sizes/);
  expectProblem(problemsAfter((e) => (e.icons = [])), /list at least one icon/);
  expectProblem(problemsAfter((e) => (e.repository.url = "https://github.com/CuddlerAI/other")), /repository\.url is "https:\/\/github\.com\/CuddlerAI\/other"/);
  expectProblem(problemsAfter((e) => (e.repository.id = "R_kgDO")), /numeric repository id/);
});

test("_meta keeps only what the registry keeps", () => {
  expectProblem(problemsAfter((e) => (e._meta = { "com.example/build": { commit: "abc" } })), /is dropped by the registry/);
  expectProblem(
    problemsAfter((e) => (e._meta = { "io.modelcontextprotocol.registry/publisher-provided": { notes: "x".repeat(5000) } })),
    /over 4096 bytes/,
  );
  assert.deepEqual(problemsAfter((e) => (e._meta = { "io.modelcontextprotocol.registry/publisher-provided": { tool: "ci" } })), []);
});

test("validate.mjs: server.json is required, follows claims.json and names no plan or price", () => {
  expectProblem(validateCopy((dir) => rmSync(join(dir, "server.json"))), /required file is missing/);
  expectProblem(
    validateCopy((dir) => {
      const claims = JSON.parse(readFileSync(join(dir, "claims.json"), "utf8"));
      claims.mcp.url = "https://mcp.cuddler.ai/v2/mcp";
      writeFileSync(join(dir, "claims.json"), `${JSON.stringify(claims, null, 2)}\n`);
    }),
    /remotes\[0\]\.url is "https:\/\/mcp\.cuddler\.ai\/mcp"; the server is https:\/\/mcp\.cuddler\.ai\/v2\/mcp/,
  );
  expectProblem(
    validateCopy((dir) => {
      const entry = JSON.parse(readFileSync(join(dir, "server.json"), "utf8"));
      entry.description = "Make AI videos and images on your Cuddler Pro account, with a free trial.";
      writeFileSync(join(dir, "server.json"), `${JSON.stringify(entry, null, 2)}\n`);
    }),
    /description: "(?:trial|Pro)"; the entry names no plan, price, trial or upgrade/,
  );
});

test("the publish workflow runs only by hand, on main, in its environment, with a pinned and checked mcp-publisher", () => {
  assert.match(WORKFLOW, /^on:\n {2}workflow_dispatch:\n\n/m);
  assert.doesNotMatch(WORKFLOW, /^\s+(?:push|pull_request|schedule|release|workflow_run):/m);
  assert.match(WORKFLOW, /^ {4}environment: mcp-registry$/m);
  assert.match(WORKFLOW, /"\$GITHUB_REF" != "refs\/heads\/main"/);
  assert.match(WORKFLOW, /PUBLISHER_VERSION: v\d+\.\d+\.\d+$/m);
  assert.match(WORKFLOW, /PUBLISHER_SHA256: [0-9a-f]{64}$/m);
  assert.match(WORKFLOW, /sha256sum -c -/);
  assert.match(WORKFLOW, /mcp-publisher login dns --domain cuddler\.ai /);
  assert.doesNotMatch(WORKFLOW, /id-token: write|contents: write/);
});
