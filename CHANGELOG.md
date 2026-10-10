# Changelog

All notable changes to the Cuddler skills. The version here, `VERSION` and every plugin manifest must match (CI checks).

## [0.3.0] — 2026-10-09

First public version. The numbering continues from the internal 0.2.0 skills, which this repository replaces for everyone outside the Cuddler team.

### Changed

- **The skills use the Cuddler MCP server** (`https://mcp.cuddler.ai/mcp`) instead of the `cuddler` command-line tool, so anyone with a Cuddler account can use them today.
- **The plugin brings the MCP server along.** Installing it on Claude Code or Codex adds both the skills and the connection; signing in happens once, in the browser.
- **`cuddler-setup`** now installs the plugin, signs in through the browser and checks the account. There is no token to copy and no tool to download.
- **Hard rules** rewritten for the MCP tools: one quote and one gate per render, approval links for larger renders, one idempotency key per render, no credentials in the chat.
- Descriptions say when to use each skill instead of summarising its steps.

### Removed

- The prompt-remix skill (rights risk) and every bring-your-own provider key path.
- Every price and credit figure inside the skills: prices come from the tools at runtime.

### Added

- `claims.json`, the one source of every public claim, with `scripts/claims.mjs` to render the README from it.
- `.mcp.json` for the plugin, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `CODEOWNERS`.
- Eval cases in the `claude plugin eval` format, with mocked Cuddler tools so a run spends nothing.
- Validator checks: no command-line instructions, no hard-coded prices, only real Cuddler tool names, README in sync with `claims.json`, `.mcp.json` in sync with `claims.json`, no internal addresses.
- MIT license (trademarks excluded).
- Separate steps for the Codex app and the Codex CLI in `INSTALL.md` and `cuddler-setup`: where to install, how to sign in, Codex's own approval prompts, `codex exec` approvals per tool, and keeping the CLI as new as the app.
- The Codex app adds the marketplace from **Plugins → Add → Add a marketplace**; no terminal or restart needed.
- `.agents/plugins/marketplace.json`, the Codex marketplace file: the marketplace shows as "Cuddler" and signing in is part of installing.
- The Codex manifest carries the listing the OpenAI plugin directory asks for (support, privacy and terms links, at most three starter prompts, a composer icon, `cuddler-setup` as the onboarding skill), and the validator holds it to the directory's limits.
- `scripts/pack-openai.mjs` builds the package for the OpenAI plugin directory from this repository: the plugin files only, the same bytes for the same files, and no build while the validator reports an error.
- The eval mocks follow the live Cuddler MCP server. `evals/mocks/cuddler/_tools.json` is its tool list, so eval runs show the real tool descriptions and required arguments. Each mock answers in the server's own format, including the `<untrusted-user-content>` block around results that carry user-written text. The validator checks both.
- The Cursor manifest names `.mcp.json` and the logo (Cursor's `mcpServers` and `logo` fields), so the Cursor plugin carries the MCP server too.
- `.mcp.json` sends one fixed header, `X-Cuddler-Source: plugin`, so Cuddler can count the connections that come from the plugin. Claude Code and Cursor read it from `headers`, Codex from `http_headers`; the validator keeps the two identical.
