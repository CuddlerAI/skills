# Changelog

All notable changes to the Cuddler skills. The version here, `VERSION` and every plugin manifest must match (CI checks).

Versions stay at 0.x while the skills are in beta: a minor version may change the hard rules or what the skills expect from the tools, only the latest version gets fixes, and every change that reaches `main` bumps the version. Each version is tagged `v<version>` and published as a GitHub Release with its entry below.

## [0.3.12] — 2026-10-14

Listing details for Anthropic's plugin directory. Nothing changes in what the skills do.

### Changed

- **The Claude Code manifest carries its listing details.** `.claude-plugin/plugin.json` now names the icon (`assets/logo.png`), the install guide as its documentation, Cuddler's support page, privacy policy and terms, and the support address, so a directory listing can show them. The Codex manifest already had them.

## [0.3.11] — 2026-10-14

Wording. Nothing changes in what the skills do.

### Changed

- **OpenClaw at the top of the README.** The tagline names OpenClaw next to Claude Code, Codex and Cursor, the introduction says OpenClaw sends the finished file into your chat, and the OpenClaw install section links the package on ClawHub.
- **Creator partners can connect too.** The plans line, the README and ClawHub README requirements and both install guides say that a place in Cuddler's Creator Partnership Program also lets an account connect, as the skills and the server already do. The ClawHub README's requirements now name the paid plan as well.

## [0.3.10] — 2026-10-14

Cuddler now leaves spending to the account's balance: no approval threshold and no daily limit unless Cuddler sets one, and connecting is for paid plans. The skills and the docs say what the server does.

### Changed

- **Connecting needs a paid plan.** The README, the install guides and the Codex listing say that connecting is for paid Cuddler plans (Lite, Pro or Ultra); free plans, trials and gifted plans can't connect. `cuddler-setup` and `cuddler-generate` recognise the refusal (`account_not_eligible`), say so and stop.
- **No numbers for limits.** The README's limits line, SECURITY.md and the install guides no longer name an approval threshold or a daily budget: Cuddler's server charges at most the quoted `maxCredits`, spends nothing unless spending was allowed at sign-in, and, in agents that support it, asks in the agent's own dialog before each paid call. The Claude Code guide says how to answer that dialog (Space ticks the box, then Accept; Decline or Esc charges nothing; after ten minutes Cuddler asks again).
- **`budget` may be null.** `cuddler-setup` reports what is left today only when `whoami` says a daily limit is set, and `cuddler-generate` compares the price with `budgetRemaining` only when it is a number. The approval link and the daily-limit refusal stay handled for the case that Cuddler turns them on.
- The saved tool list and the mocks in `evals/` follow the server's new wording and shapes; `setup-account` no longer expects a daily figure.

## [0.3.9] — 2026-10-14

Cuddler for OpenClaw, packaged for ClawHub.

### Added

- **OpenClaw plugin.** `openclaw.plugin.json` loads the four skills and the Cuddler MCP server (Streamable HTTP, signed in with OAuth in the browser). Install with `openclaw plugins install clawhub:cuddler`; the README, INSTALL and INSTALL_FOR_AGENTS show how to install it and sign in, including `--code` for a browser on another machine. `cuddler-setup` covers OpenClaw in its install and sign-in tables and knows tool names such as `cuddler__whoami`.
- **The ClawHub package.** `node scripts/pack-openclaw.mjs` builds `dist/openclaw/`: the listing README from `clawhub/README.md`, the manifests ClawHub and OpenClaw read, the icon, the license and trademark files, and the skills. It refuses to build while validation fails.
- The validator checks the OpenClaw manifest (version, skills, server and sign-in, no code to run) and the ClawHub README like the main README (claims blocks, links, skills table, wording).

### Changed

- **Files in chat apps.** Where the user can't open a path on the agent's machine, `cuddler-generate` and `cuddler-character-clip` also send the finished file into the chat (OpenClaw: a `MEDIA:` line with a fresh download link, or `image.url` for an image).

## [0.3.8] — 2026-10-14

### Fixed

- **Repairable first takes stay fix.** `cuddler-review` separates machine FAIL checks from the final verdict. Reject requires an observed content red line or evidence that the one re-shoot still failed. Technical defects alone do not imply a failed re-shoot, and character-only checks apply only to the relevant brief.

### Added

- Review decision evals for a repairable first take, a content red line despite passing technical checks, and a failed re-shoot. They use evidence stated as already inspected; real-file extraction is a separate integration check.

## [0.3.7] — 2026-10-14

Wording. Nothing changes in what the skills do.

### Changed

- **Hard rule 7 says what it means.** "Adult characters only, in grown-up (non-school) settings" replaces "Adults only, in adult contexts" in every skill, in the prompt-craft notes, in the validator's protected phrases and in CONTRIBUTING.
- **The character-clip template keeps the tone warm.** Its closing line says "playful, warm tension", and the gesture list drops two mouth gestures.
- **The quote is the price.** The README no longer says a render costs the same as in the Cuddler app: what the quote says is what is charged.
- **A second no-retry reason.** `reference_not_registered` joins `provider_rejected` and `reference_face_rejected` in `cuddler-generate`: the model refused the video, so there is no retry; change the prompt or the images. The saved tool list in the evals carries the server's current wording.
- The marketplace entry carries the package description from 0.3.6, and the validator's promotion check covers the package description too.
- CI checks out the repository without keeping its credentials, and an issue template for ideas and questions joins the bug report.

## [0.3.6] — 2026-10-13

Listing copy for the OpenAI plugin directory, ahead of the submission.

### Changed

- **The package description names the account, not a membership.** The three plugin manifests say "Make AI videos and images on your own Cuddler account from ChatGPT, Codex, Claude Code or Cursor: connect and sign in, quoted renders, character clips and local clip review."
- **The directory listing's long description is rewritten** for ChatGPT and Codex users: what the plugin does, how it stays safe (sign-in in the browser, the price before every render, the approval page and the daily limit, characters rated for all audiences only, private until published) and what an account needs.

### Added

- The review information the directory asks for, in the Codex manifest under `extensions.com.openai`: five positive and three negative test cases, the commerce declaration and the release notes. The demo recording link is filled in at submission.

## [0.3.5] — 2026-10-13

Follow-ups from a review of the repository as an open-source project.

### Changed

- **Downloads are https only and keep plain file names.** Hard rule 1 says the skills fetch the links the tools return over `https://` only and save a file under its own name, never under a path from a link or a result, and that an approval link is a page on cuddler.ai. The curl commands in `cuddler-generate`, `cuddler-character-clip` and `cuddler-review` carry `--proto =https --proto-redir =https`. New eval `download-link-check`.
- **The Always allow advice names the server's limits.** Where the skills and the install guide suggest letting the host stop asking before Cuddler's paid tools, they say that Cuddler's server keeps its own limits either way: `maxCredits` on every call, the approval page above the account's threshold, the daily budget. `SECURITY.md` separates how the skills are built to behave from what the server enforces, and now acknowledges reports instead of promising an answer.
- **`cuddler-review` no longer says "nothing is uploaded".** The script runs locally; the frames the agent reads afterwards reach its model like any opened file.
- **One word for the daily budget.** It belongs to a connection (one per agent you connect), in `claims.json` and in `cuddler-generate`.
- The validator's own patterns describe no infrastructure: the command-line check matches any `cuddler <word>` command, the provider-key check matches "bring your own key", the project-id check matches any `<word>-<six digits>`, and the test fixtures use made-up names.

### Added

- `TRADEMARKS.md`: the Cuddler name and logo are not under the MIT license, and what that means for forks. It ships in the OpenAI directory package. Each `SKILL.md` carries `license: MIT` in its frontmatter, so a flat install keeps the license, and the validator accepts only that value.
- README sections **What you need** and **Help**; issue templates that send account and credit questions to Cuddler support and security problems to the private report; a contact address in the code of conduct.
- CI fails a pull request whose title, description or commit messages name a private repository, an internal path or a server setting (`scripts/public-wording.mjs`); CONTRIBUTING says the same and states the contribution license.
- This changelog states the versioning policy; the install guide says the Cursor plugin isn't listed in Cursor's marketplace yet.

## [0.3.4] — 2026-10-12

### Changed

- **One confirmation when Cuddler asks through the host.** Cuddler can ask the user itself, in the host's own dialog, before a paid call runs (a form with the price at or under the approval threshold, the approval page above it). Cuddler is turning this on account by account, so most quotes carry no `confirmation` field yet. A quote then says `confirmation: "host"`, and the skills give the price in one line and make the call instead of also asking in chat, so the user confirms once (Hard rule 2, all four skills). Without that field, or with `confirmation: "chat"`, nothing changes: the skills ask, as before. A paid retry has no quote, so the skills still ask in chat.
- **The confirmation refusals are handled.** `confirmation_declined` and `confirmation_cancelled` (the user said no or closed the dialog; nothing was charged) stop the request until the user asks again; `confirmation_pending` gets the approval link again; `confirmation_mismatch` and `confirmation_used` are in the refusal table of `cuddler-generate`.

### Added

- Evals `host-confirmation` (a quote that says `confirmation: "host"` leads to one create and no question in chat) and `host-declined` (a declined dialog ends the request with nothing charged and no second try).
- The validator keeps `confirmation: "host"` and `confirmation_declined` in the Hard rules.

## [0.3.3] — 2026-10-12

### Changed

- **One question per paid render, once the host stops asking.** Hosts like Codex (in Ask for approval) and Claude Code ask on their own before a tool that spends credits runs, on top of the skill's price question. The first price question of a session now says so: choosing Always allow there (in Claude Code, the option that stops asking for that tool) leaves the price question as the only one, and if the host asks again later, the user allows it again. `cuddler-setup` and the install guide say the same. The skills still ask before every paid call, including when the host runs tools without asking.

## [0.3.2] — 2026-10-12

Wording fixes ahead of the OpenAI plugin directory submission.

### Changed

- **No sales pitch when credits or the plan stop a render.** `cuddler-generate` says what happened and what is still possible; it no longer tells the user to top up or which plan would unlock a model. `cuddler-setup` no longer links the membership page, which takes payments; asked which plans include video, it reads `requiredPlan` from `list_models`. The OpenAI plugin directory lets a plugin say that a feature isn't in the user's plan, but not sell credits or plans, promote upgrades or link to a page that takes payment. The `video-not-in-plan` eval now fails a reply that presses for an upgrade.
- **`contact-sheet.sh` points to `get_download_link`** when it is given a web address, instead of the retired `cuddler download` command.

### Added

- Validator checks: the command-line check reads the skills' scripts too, and a new check fails skill text that tells the user to top up, upgrade or buy credits, or links the membership page.

## [0.3.1] — 2026-10-12

Fixes from the first end-to-end run on a paid account, in Claude Code and the Codex app.

### Changed

- **The price question speaks the user's language.** It still gives the price in credits and asks once; in English it ends in "reply proceed", in another language with the same words in that language (Hard rule 2, all four skills).
- **Images are saved locally.** After `create_image` the skills save the picture into `./out/` and give its path. The Codex app doesn't show pictures from web addresses, but it shows a local file. Hard rule 1 now lists image URLs among the addresses the skills may download from.
- **The account is named.** `cuddler-setup` reports which Cuddler account the connection uses, and the video price question names it, so a sign-in to the wrong account shows before anything is spent. Troubleshooting says how to switch accounts.
- **Sign-in links are opened right away.** `cuddler-setup` says the agent waits for the browser only a few minutes and what to do when the page can't reach `localhost`.
- **`cuddler-review` catches softer cuts.** The default cut threshold is 0.2 (was 0.35): two hard cuts in misty shots scored 0.26 and 0.30 and were missed, while motion in the same clips stayed under 0.09.
- **Codex downloads are explained.** The install guide and `cuddler-setup` say that Codex asks to allow network access when the skill saves a finished file.

## [0.3.0] — 2026-10-09

First public version. The numbering continues from an earlier version that only the Cuddler team used.

### Changed

- **The skills use the Cuddler MCP server** (`https://mcp.cuddler.ai/mcp`) instead of the `cuddler` command-line tool, so anyone with a Cuddler account can use them today.
- **The plugin brings the MCP server along.** Installing it on Claude Code or Codex adds both the skills and the connection; signing in happens once, in the browser.
- **`cuddler-setup`** now installs the plugin, signs in through the browser and checks the account. There is no token to copy and no tool to download.
- **Hard rules** rewritten for the MCP tools: one quote and one gate per render, approval links for larger renders, one idempotency key per render, no credentials in the chat.
- Descriptions say when to use each skill instead of summarising its steps.

### Removed

- The prompt-remix skill and every path that used a provider key of your own.
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
- `cuddler-generate` explains the `member_cost_breaker` refusal: a member whose plan credits for the billing period can no longer be spent through agents is told until when, that nothing was charged and that the app is not affected. Eval case `plan-credits-capped` covers it.
