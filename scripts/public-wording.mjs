#!/usr/bin/env node
// public-wording.mjs — fails a pull request whose title, description or commit messages name something that stays
// private: a private repository or its pull requests, an internal path, a server setting, an internal address.
// Everything in this repository is public, those texts included.
//
//   PR_TITLE=… PR_BODY=… BASE_SHA=… HEAD_SHA=… node scripts/public-wording.mjs
//
// CI sets the variables from the pull_request event. Without BASE_SHA and HEAD_SHA the script checks the commits of
// the current branch that origin/main doesn't have.

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The organisation's public repositories; any other CuddlerAI/<name> is private. */
const PUBLIC_REPOS = ["skills", ".github", "research", "cuddler-publish"];

export const PRIVATE_PATTERNS = Object.freeze([
  [new RegExp(`\\bCuddlerAI/(?!(?:${PUBLIC_REPOS.map((r) => r.replace(".", "\\.")).join("|")})\\b)[\\w.-]+(?:#\\d+)?`), "a private repository or one of its pull requests"],
  [/\b(?:apps|packages)\/[\w-]+\/|\bserver\/mcp\b/, "an internal path"],
  [/\bMCP_[A-Z][A-Z0-9_]+\b/, "a server setting"],
  [/\/api\/admin\b|admin[ _-]secret/i, "an admin route or secret"],
  [/\bgcloud\s+secrets\b/, "a secret store"],
  [/feishu\.cn|larksuite\.com/i, "a chat link"],
  [/\bdocs\/(?:design|research|runbook|plans)[\w/-]*/, "a document path from a private repository"],
  [/\b[a-z]+-\d{6}\b/, "a cloud project id"],
]);

/** @param {Array<[string, string]>} texts pairs of [where, text]; one problem per matching line and pattern */
export function wordingProblems(texts) {
  const problems = [];
  for (const [where, text] of texts) {
    (text ?? "").split(/\r?\n/).forEach((line, i) => {
      for (const [pattern, what] of PRIVATE_PATTERNS) {
        const match = pattern.exec(line);
        if (match) problems.push({ where, line: i + 1, what, match: match[0] });
      }
    });
  }
  return problems;
}

function commitMessages(base, head) {
  const range = base && head ? `${base}..${head}` : "origin/main..HEAD";
  const out = execFileSync("git", ["log", "--format=%H%x00%B%x00", range], { encoding: "utf8" });
  const parts = out.split("\0");
  const texts = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const sha = parts[i].trim();
    if (sha) texts.push([`commit ${sha.slice(0, 7)}`, parts[i + 1]]);
  }
  return texts;
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const texts = [
    ["the pull request title", process.env.PR_TITLE ?? ""],
    ["the pull request description", process.env.PR_BODY ?? ""],
    ...commitMessages(process.env.BASE_SHA, process.env.HEAD_SHA),
  ];
  const problems = wordingProblems(texts);
  for (const p of problems) console.log(`::error::${p.where}, line ${p.line}: names ${p.what} (${p.match}); this repository is public`);
  console.log(problems.length ? `${problems.length} problem(s)` : `public wording: ${texts.length} texts checked, nothing internal named`);
  process.exit(problems.length ? 1 : 0);
}
