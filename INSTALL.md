# Install

Two parts: the **skills** (instructions your agent reads) and the **Cuddler MCP server** (the tools that actually make images and videos). On Claude Code and Codex the plugin brings both; elsewhere you add them one by one.

## Claude Code

```bash
claude plugin install cuddler --marketplace CuddlerAI/skills
```

Inside Claude Code you can do the same with `/plugin marketplace add CuddlerAI/skills` and then `/plugin install cuddler@cuddler`. Restart Claude Code, then type `/mcp`, choose the Cuddler server and sign in. A Cuddler page opens in your browser: sign in and allow the connection, including **spending credits** if you want to make images and videos.

The skills are then available as:

- `/cuddler:cuddler-setup`
- `/cuddler:cuddler-generate`
- `/cuddler:cuddler-character-clip`
- `/cuddler:cuddler-review`

You rarely need to type them: ask for what you want ("make a 10-second clip of …") and Claude picks the right skill.

Update: `/plugin marketplace update cuddler`. Remove: `/plugin uninstall cuddler@cuddler`.

## Codex

```bash
codex plugin marketplace add CuddlerAI/skills
codex plugin add cuddler@cuddler
codex mcp login cuddler
```

The last command opens the Cuddler sign-in page in your browser. Finish it within a few minutes; `codex mcp login` stops waiting after that and you run it again. Tick **Spend credits** if you want images and videos. The page may say Cuddler hasn't reviewed the app: that's expected for Codex, so continue if you started the connection. Then start a new Codex session.

**Scripts and `codex exec`.** Non-interactive Codex never asks for approval, so it refuses the tools that spend credits. Allow them for that run only:

```bash
codex exec \
  -c 'plugins.cuddler@cuddler.mcp_servers.cuddler.tools.create_image.approval_mode="approve"' \
  -c 'plugins.cuddler@cuddler.mcp_servers.cuddler.tools.create_video.approval_mode="approve"' \
  "Make a square image of a paper boat on a rain puddle at dusk"
```

The skills still quote every render first and wait for you: answer with `codex exec resume --last "proceed"` and the same `-c` flags.

Update: `codex plugin marketplace upgrade`. Remove: `codex plugin remove cuddler@cuddler`.

## Gemini CLI

```bash
npx skills add CuddlerAI/skills -a gemini-cli
gemini mcp add --transport http cuddler https://mcp.cuddler.ai/mcp
```

Then, inside Gemini CLI: `/mcp auth cuddler`.

## Cursor and other agents

1. Install the skills: `npx skills add CuddlerAI/skills` (it asks which agent; `-a <agent>` picks one).
2. Add the MCP server `https://mcp.cuddler.ai/mcp` (Streamable HTTP). For Cursor, the Cuddler assistants page at https://cuddler.ai/mcp has a one-click link.
3. Sign in when your agent asks, in the browser.

## Check that it works

Ask your agent: "Connect my Cuddler account". The `cuddler-setup` skill checks the connection and tells you your plan, your credits and what this agent may still spend today.

## Disconnect

Remove the plugin or the MCP server from your agent, and revoke the connection on cuddler.ai under Settings → Developer API tokens.
