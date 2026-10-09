# Contributing

Thanks for helping. These skills run on other people's machines and spend other people's credits, so the bar is: safe first, then useful.

## Before you open a pull request

```bash
node scripts/validate.mjs              # structure, hard rules, claims, manifests, safety lints
node --test scripts/validate.test.mjs  # the validator's own tests (and the review script, if ffmpeg is installed)
claude plugin validate --strict .      # the plugin manifests, as Claude Code reads them
```

Node.js 20 or newer; no other dependencies.

## The rules every skill keeps

- **The Hard rules block is identical in every skill.** Change it in one, copy it to all, and update `RULE_PHRASES` in `scripts/validate.mjs` if you change a protected phrase.
- **Cuddler MCP tools only.** Skills name only the tools of the Cuddler MCP server; the validator rejects any other tool name and any command-line instruction.
- **No prices or credit figures in skills or in the README.** Prices come from the tools at runtime. Public figures (limits, links, install commands) live in `claims.json`, and the README is generated from it with `node scripts/claims.mjs`.
- **Descriptions say when to use the skill, not what it does step by step.** They must contain "Use when" and "NOT for", in at most 1,024 characters.
- **One `SKILL.md` stays under 300 lines.** Move detail into `references/`.
- **Content red lines don't move**: adults only, no school settings, no real people, no other people's characters or brands.

## Changing what a skill does

1. Add or update a case in `evals/` (see [evals/README.md](evals/README.md)): a `prompt.md`, its `graders/`, and mocks for any tool answer the case needs.
2. Run it with and without the plugin: `claude plugin eval . --case <name> --no-publish`. The with-plugin arm should win clearly; paste the result in the pull request.
3. Run the validator and its tests.

## Releasing

Bump `VERSION`, the three plugin manifests, the marketplace entry and `CHANGELOG.md` together (CI checks they match), merge, then tag `v<version>` on `main`.

## Code owners

`README.md`, `claims.json`, `scripts/` and `.github/` need a review from the GTM owner and a second maintainer (see `.github/CODEOWNERS`): those files change what we promise in public and how releases are checked.
