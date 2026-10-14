# Install Cuddler (instructions for an AI agent)

The user pasted this file so you install the Cuddler skills and connect their Cuddler account. Follow these steps in order. Ask before running any command.

1. **Work out which agent you are.**
   - Claude Code → run `claude plugin install cuddler --marketplace CuddlerAI/skills`.
   - Codex → run `codex plugin marketplace add CuddlerAI/skills`, then `codex plugin add cuddler@cuddler`.
   - OpenClaw → run `openclaw plugins install clawhub:cuddler`; it brings the skills and the MCP server.
   - Any other agent → run `npx skills add CuddlerAI/skills` and add the MCP server `https://mcp.cuddler.ai/mcp` (Streamable HTTP) with your own MCP command or settings. Don't hand-edit config files you don't understand; show the user what to add instead.
2. **Ask the user to sign in.** They do this themselves, in the browser:
   - Claude Code: restart, then `/mcp` → the Cuddler server → Authenticate.
   - Codex: `codex mcp login cuddler`, then a new session.
   - OpenClaw: in the Control UI, Plugins → Cuddler → Accounts → Connect; or run `openclaw mcp add cuddler --url https://mcp.cuddler.ai/mcp --transport streamable-http --auth oauth --header X-Cuddler-Source=plugin --timeout 240`, then `openclaw mcp login cuddler` and give the user the link it prints. Then a new session.
   - Others: the agent's own MCP sign-in.

   They should allow **spending credits** if they want to make images and videos. Never ask for a password, token or code in the chat.
3. **Check.** In the next session, use the `cuddler-setup` skill (or call the `whoami` tool) and tell the user their plan, credits and today's budget for this agent.
4. **Stop there.** Don't make anything until the user asks; every image or video is priced first and needs their OK.

If something fails, tell the user what you ran and what came back, and point them to https://github.com/CuddlerAI/skills/blob/main/INSTALL.md.
