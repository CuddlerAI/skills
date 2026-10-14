# Contributing

Thanks for helping. These skills run on other people's machines and spend other people's credits, so the bar is: safe first, then useful.

## What to send

- **A small fix can come straight as a pull request:** a typo, a broken link, a clearer sentence in the docs, or a clear bug together with its fix.
- **Everything else starts with an issue.** A change to what a skill does, to the Hard rules, to `scripts/` or to `.github/` needs a plan the maintainer has agreed to. Open an issue first and wait for an answer; a pull request that skips this step is closed with a note on where to start.
- You can have up to two pull requests open at a time.
- CI runs on your pull request once a maintainer approves the run. A pull request that changes `scripts/` or `.github/` is checked again with the scripts from `main`.

## Before you open a pull request

```bash
node scripts/validate.mjs              # structure, hard rules, claims, manifests, safety lints
node --test scripts/validate.test.mjs  # the validator's own tests (and the review script, if ffmpeg is installed)
claude plugin validate --strict .      # the plugin manifests, as Claude Code reads them
```

Node.js 20 or newer; no other dependencies.

## Writing for a public repository

Everything here is public, commit messages, pull request descriptions and comments included. Describe what the skills do. Don't name private repositories or their pull requests, internal paths, server settings or internal addresses, and don't paste from internal documents; CI checks the description and the commit messages of every pull request (`scripts/public-wording.mjs`).

By opening a pull request you license your contribution under the MIT License and confirm that you wrote it or have the right to submit it.

## The rules every skill keeps

- **The Hard rules block is identical in every skill.** Change it in one, copy it to all, and update `RULE_PHRASES` in `scripts/validate.mjs` if you change a protected phrase.
- **Cuddler MCP tools only.** Skills name only the tools of the Cuddler MCP server; the validator rejects any other tool name and any command-line instruction.
- **No prices or credit figures in skills or in the README.** Prices come from the tools at runtime. Public figures (limits, links, install commands) live in `claims.json`, and the README is generated from it with `node scripts/claims.mjs`.
- **Descriptions say when to use the skill, not what it does step by step.** They must contain "Use when" and "NOT for", in at most 1,024 characters.
- **One `SKILL.md` stays under 300 lines.** Move detail into `references/`.
- **Content red lines don't move**: adult characters only, no school settings, no real people, no other people's characters or brands.

## Changing what a skill does

1. Add or update a case in `evals/` (see [evals/README.md](evals/README.md)): a `prompt.md`, its `graders/`, and mocks for any tool answer the case needs. Write mocks in the server's own format; the validator checks it.
2. Run it with and without the plugin: `claude plugin eval . --case <name> --no-publish`. The with-plugin arm should win clearly; paste the result in the pull request. A run costs about half a dollar per case on your own Claude Code quota; if you can't run it, say so and the maintainer runs it before merging.
3. Run the validator and its tests.

## Releasing

Every change that reaches `main` bumps `VERSION` (a patch bump is enough for wording), together with the three plugin manifests, the marketplace entry and `CHANGELOG.md` (CI checks they match). After the merge, tag `v<version>` on `main` and create a GitHub Release from the tag with the CHANGELOG entry.

## The OpenAI plugin directory

ChatGPT and Codex share one plugin directory, and its listing is built from this repository:

```bash
node scripts/pack-openai.mjs   # dist/cuddler-<version>-openai.zip
```

The ZIP holds the Codex manifest, `.mcp.json`, `skills/`, `assets/`, `LICENSE` and `TRADEMARKS.md`, and the script refuses to build while `validate.mjs` reports an error; the validator holds the Codex manifest to the directory's listing rules. The Cuddler team uploads it on the OpenAI Platform. Changes to skills, the listing text or the icons need a new upload; changes to the Cuddler MCP tools don't.

## Code owners

`.github/CODEOWNERS` names who reviews each change; today one maintainer owns the whole repository. Take the most care with `README.md`, `claims.json`, `scripts/` and `.github/`: those files change what we promise in public and how releases are checked.
