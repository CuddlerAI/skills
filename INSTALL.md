# Install

Two parts: the **skills** (instructions your agent reads) and the **Cuddler MCP server** (the tools that actually make images and videos). On Claude Code and Codex the plugin brings both. The Cursor plugin is ready but not listed in Cursor's marketplace yet, so on Cursor and other agents you add them one by one.

## Claude Code

```bash
claude plugin install cuddler --marketplace CuddlerAI/skills
```

Inside Claude Code you can do the same with `/plugin marketplace add CuddlerAI/skills` and then `/plugin install cuddler@cuddler`. Restart Claude Code, then type `/mcp`, choose the Cuddler server and sign in. A Cuddler page opens in your browser: sign in and allow the connection, including **spending credits** if you want to make images and videos. When Claude Code asks to allow a Cuddler tool that spends credits, choose the option that stops asking for that tool: the skills still show the price first and wait for your OK, and Cuddler's server keeps its own limits either way (every paid call is capped at the quoted `maxCredits`, larger renders need your approval in the browser, and each connection has a daily budget).

The skills are then available as:

- `/cuddler:cuddler-setup`
- `/cuddler:cuddler-generate`
- `/cuddler:cuddler-character-clip`
- `/cuddler:cuddler-review`

You rarely need to type them: ask for what you want ("make a 10-second clip of …") and Claude picks the right skill.

Update: `/plugin marketplace update cuddler`. Remove: `/plugin uninstall cuddler@cuddler`.

## Codex app

Cuddler isn't in the public plugin directory yet, so add its marketplace first. The Codex app (inside the ChatGPT desktop app) and the Codex CLI share it, so this is done once.

1. Open **Plugins**, then **Add → Add a marketplace**. Enter `CuddlerAI/skills` as the **Source**, leave **Git ref** and **Sparse paths** empty, and select **Add marketplace**. From a terminal, `codex plugin marketplace add CuddlerAI/skills` does the same.
2. Find **Cuddler** on the **Personal** tab, where added marketplaces show, and install it. The four Cuddler skills come with it; there is nothing to add under **Skills**.
3. Installing opens a Cuddler sign-in page in your browser: sign in, tick **Spend credits** if you want images and videos, and allow it within five minutes. The page may say Cuddler hasn't reviewed the app; that's expected for Codex. Missed it? Settings → MCP servers → Cuddler → Authenticate.
4. Start a new chat and mention the plugin: `@Cuddler make a 10-second vertical clip of a paper boat in the rain`.
5. Keep the permission mode on **Ask for approval**. Before a paid render Codex asks to allow `create_image` or `create_video`: choose **Always allow**, so the skill's price question is the only one next time; if Codex asks again later, allow it again. The skills always show the price first and wait for your OK, and Cuddler's server keeps its own limits either way (the quoted `maxCredits`, the approval page for larger renders, the daily budget). With **Full access**, Codex doesn't ask at all, so the price question and those server limits are the only checks. When an image or clip is ready, the skill saves it into `./out/`; Codex's sandbox has no network by default, so Codex also asks to allow that download.

## Codex CLI

1. Use a CLI at least as new as your Codex app (`codex --version`; update with `codex update` or `npm install -g @openai/codex@latest`). An older CLI fails with "The '…' model is not supported" after the app switched to a newer model.
2. Install and sign in:

   ```bash
   codex plugin marketplace add CuddlerAI/skills
   codex plugin add cuddler@cuddler
   codex mcp login cuddler
   ```

   Inside Codex, `/plugins` does the first two steps. The login opens the Cuddler sign-in page: finish it within five minutes, and tick **Spend credits** if you want images and videos. On a remote machine add `--no-browser` and open the printed link yourself. Check the connection with `/mcp`.
3. Start a new session and ask for what you want, or call a skill directly with `$cuddler-generate`.
4. Before a paid render Codex asks to allow `create_image` or `create_video`: choose **Always allow** so only the skill's price question remains (**Allow** and **Allow for this session** work too); if it asks again later, allow it again. Saving the finished file into `./out/` asks for network access the same way.

### Scripts and `codex exec`

Non-interactive Codex never asks for approval, so it refuses the tools that spend credits. Allow them for that run only:

```bash
codex exec \
  -c 'plugins.cuddler@cuddler.mcp_servers.cuddler.tools.create_image.approval_mode="approve"' \
  -c 'plugins.cuddler@cuddler.mcp_servers.cuddler.tools.create_video.approval_mode="approve"' \
  "Make a square image of a paper boat on a rain puddle at dusk"
```

The skills still quote every render first and wait for you: answer with `codex exec resume --last "proceed"` and the same `-c` flags. Don't use `--dangerously-bypass-approvals-and-sandbox` for this; it removes every other safeguard too.

Update (app and CLI): **Upgrade marketplace** next to Cuddler in the app's marketplace list, or `codex plugin marketplace upgrade`. Remove: `codex plugin remove cuddler@cuddler`.

## Gemini CLI

```bash
npx skills add CuddlerAI/skills -a gemini-cli
gemini mcp add --transport http cuddler https://mcp.cuddler.ai/mcp
```

Then, inside Gemini CLI: `/mcp auth cuddler`.

## Cursor and other agents

The repository carries a Cursor plugin manifest, but Cuddler isn't listed in Cursor's marketplace yet. Until it is:

1. Install the skills: `npx skills add CuddlerAI/skills` (it asks which agent; `-a <agent>` picks one).
2. Add the MCP server `https://mcp.cuddler.ai/mcp` (Streamable HTTP). For Cursor, the Cuddler assistants page at https://cuddler.ai/mcp has a one-click link.
3. Sign in when your agent asks, in the browser.

## Check that it works

Ask your agent: "Connect my Cuddler account". The `cuddler-setup` skill checks the connection and tells you your plan, your credits and what this agent may still spend today.

## Disconnect

Remove the plugin or the MCP server from your agent, and revoke the connection on cuddler.ai under Settings → Developer API tokens.
