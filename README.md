# Cuddler skills

<!-- claims:tagline -->
Make AI videos and images from Claude Code, Codex or Cursor, with the Cuddler membership you already have.
<!-- /claims:tagline -->

<!-- claims:beta -->
**Beta.** The skills are new and still changing. Tell us what breaks in the issues.
<!-- /claims:beta -->

Skills and a plugin for coding agents. Install them, connect your Cuddler account once in the browser, and ask your agent for a video. It shows the price, waits for your OK, renders on Cuddler and saves the file next to your project.

## What you can do

| Skill | Ask your agent |
|---|---|
| [`cuddler-setup`](skills/cuddler-setup/SKILL.md) | "Connect my Cuddler account" — install, sign in, see your plan, credits and today's budget |
| [`cuddler-generate`](skills/cuddler-generate/SKILL.md) | "Make a 10-second vertical clip of a paper boat in the rain" — videos and images, priced before anything is spent |
| [`cuddler-character-clip`](skills/cuddler-character-clip/SKILL.md) | "Turn my character into a 15-second clip" — one of your own Cuddler characters talking to the viewer |
| [`cuddler-review`](skills/cuddler-review/SKILL.md) | "Review ./clip.mp4 before I post it" — a local ffmpeg check with a pass, fix or reject verdict |

## Install

### Claude Code

<!-- claims:install.claude_code -->
```bash
claude plugin install cuddler --marketplace CuddlerAI/skills
```
<!-- /claims:install.claude_code -->

The first time you make something, type `/mcp`, choose the Cuddler server and sign in.

### Codex

<!-- claims:install.codex -->
```bash
codex plugin marketplace add CuddlerAI/skills
codex plugin add cuddler@cuddler
codex mcp login cuddler
```
<!-- /claims:install.codex -->

In the Codex app: run the first command, quit and reopen the app, then install Cuddler from **Plugins**. Step by step for the [Codex app](INSTALL.md#codex-app) and the [Codex CLI](INSTALL.md#codex-cli).

### Cursor, Gemini CLI and other agents

<!-- claims:install.other -->
```bash
npx skills add CuddlerAI/skills
```
<!-- /claims:install.other -->

Then add the Cuddler MCP server to your agent; the Cuddler assistants page below has one-click links. Step by step: [INSTALL.md](INSTALL.md). Or paste [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md) to your agent and let it do the install.

## Credits and limits

<!-- claims:credits -->
Renders spend credits from your own Cuddler account, at the same price as in the Cuddler app. Your agent shows the price first and waits for your OK.
<!-- /claims:credits -->

<!-- claims:limits -->
A render above 200 credits also needs one click on an approval link in your browser, and each connected app can spend up to 3,000 credits a day.
<!-- /claims:limits -->

<!-- claims:plans -->
Videos need a Cuddler plan that includes video. The setup skill tells you what your account can make.
<!-- /claims:plans -->

## Privacy and safety

- You sign in on cuddler.ai in your own browser. Your agent never sees your password, and you can disconnect it any time in Settings → Developer API tokens.
- Everything you make stays private in your Cuddler account until you publish it in the Cuddler app.
- The skills refuse content with minors, school settings, real people, and other people's characters or brands.
- Found a security problem? Report it privately: [SECURITY.md](SECURITY.md).

## Links

<!-- claims:links -->
[Cuddler](https://cuddler.ai/?utm_source=github&utm_medium=readme&utm_campaign=agent_skills) · [Plans](https://cuddler.ai/membership?utm_source=github&utm_medium=readme&utm_campaign=agent_skills) · [Cuddler in ChatGPT, Claude and other assistants](https://cuddler.ai/mcp?utm_source=github&utm_medium=readme&utm_campaign=agent_skills)
<!-- /claims:links -->

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every skill shares the same hard rules, and `node scripts/validate.mjs` checks them on every pull request.

## License

The skills, scripts and manifests are MIT licensed ([LICENSE](LICENSE)). The Cuddler name and logo are trademarks of Cuddler and are not covered by the MIT license.
