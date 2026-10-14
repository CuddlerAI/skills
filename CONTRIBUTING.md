# Contributing

Thanks for helping. These skills run on other people's machines and spend other people's credits, so the bar is: safe first, then useful.

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

Every change that reaches `main` is a new version. In the pull request, run

```bash
node scripts/bump.mjs <x.y.z>   # a patch bump is enough for wording
```

It moves the version in `VERSION`, the plugin manifests (Claude Code, Codex, Cursor and OpenClaw) and the marketplace entry, and opens an empty entry on top of `CHANGELOG.md`. Write that entry before you push: CI checks that every version matches and that the entry has text.

The merge does the rest. `.github/workflows/release.yml` notices the new version, tags `v<version>`, and publishes a GitHub Release with the CHANGELOG entry and the packages attached: `cuddler-<version>-openclaw.zip`, `cuddler-<version>-openai.zip` and `SHA256SUMS`. Then it starts `.github/workflows/clawhub-publish.yml` on the new tag, which builds the OpenClaw package, publishes it to ClawHub and waits for ClawHub's security checks. That workflow runs in the `clawhub` environment, which only release tags can use, and publishes a tag only when its commit is on `main`. ClawHub accepts the workflow's GitHub OIDC token through trusted publishing, so the repository stores no ClawHub token. If a run fails, fix the cause and run it again from the Actions tab: `release` for the tag and the Release, `clawhub-publish` with **Use workflow from** set to the tag (`v<version>`) for ClawHub. `node scripts/release.mjs` runs the same steps locally (`notes`, `summary`, `assets`).

## The OpenAI plugin directory

ChatGPT and Codex share one plugin directory, and its listing is built from this repository:

```bash
node scripts/pack-openai.mjs   # dist/cuddler-<version>-openai.zip
```

The ZIP holds the Codex manifest, `.mcp.json`, `skills/`, `assets/`, `LICENSE` and `TRADEMARKS.md`, and the script refuses to build while `validate.mjs` reports an error; the validator holds the Codex manifest to the directory's listing rules. Each GitHub Release carries it as `cuddler-<version>-openai.zip`, and the Cuddler team uploads it on the OpenAI Platform. Changes to skills, the listing text or the icons need a new upload; changes to the Cuddler MCP tools don't.

## ClawHub (OpenClaw)

OpenClaw users install Cuddler from ClawHub, and that package is built from this repository too:

```bash
node scripts/pack-openclaw.mjs   # dist/openclaw/
```

The folder holds `openclaw.plugin.json` (the skills and the Cuddler MCP server, signed in with OAuth), a `package.json` with the name and version ClawHub publishes, the same server as an OpenClaw `.mcp.json`, a short Claude manifest with the OpenClaw description (ClawHub files the package as a bundle plugin because of it, and OpenClaw loads the package through it), `skills/`, `clawhub/README.md` as its README, the icon, `LICENSE` and `TRADEMARKS.md`. The script refuses to build while `validate.mjs` reports an error, and it only clears a folder that holds an earlier package. Every release publishes it to ClawHub on its own (see Releasing), and ClawHub shows the new version once its security checks pass. To look at a build first, run `clawhub package publish dist/openclaw --owner cuddler --dry-run`.

## Code owners

`.github/CODEOWNERS` names who reviews each change; today one maintainer owns the whole repository. Take the most care with `README.md`, `claims.json`, `scripts/` and `.github/`: those files change what we promise in public and how releases are checked.
