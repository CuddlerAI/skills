# Install Cuddler (instructions for an AI agent)

The user pasted this file so you install the Cuddler skills and connect their Cuddler account. Follow these steps in order. Ask before running any command.

1. **Work out which agent you are.**
   - Claude Code → run `claude plugin install cuddler --marketplace CuddlerAI/skills`.
   - Codex → run `codex plugin marketplace add CuddlerAI/skills`, then `codex plugin add cuddler@cuddler`.
   - Any other agent → run `npx skills add CuddlerAI/skills` and add the MCP server `https://mcp.cuddler.ai/mcp` (Streamable HTTP) with your own MCP command or settings. Don't hand-edit config files you don't understand; show the user what to add instead.
2. **Ask the user to sign in.** They do this themselves, in the browser:
   - Claude Code: restart, then `/mcp` → the Cuddler server → Authenticate.
   - Codex: `codex mcp login cuddler`, then a new session.
   - Others: the agent's own MCP sign-in.

   They should allow **spending credits** if they want to make images and videos. Never ask for a password, token or code in the chat. Connecting needs a paid Cuddler plan (Lite, Pro or Ultra) or the Creator Partnership Program: if the Cuddler page says the account can't connect to AI assistants, or Cuddler answers `membership_required`, tell the user that and stop.
3. **Check.** In the next session, use the `cuddler-setup` skill (or call the `whoami` tool) and tell the user their plan, credits and whether images and videos are open. There is no daily cap for the agent unless `whoami` shows a `budget`; otherwise the credit balance is the limit.
4. **Stop there.** Don't make anything until the user asks; every image or video is priced first and needs their OK.

If something fails, tell the user what you ran and what came back, and point them to https://github.com/CuddlerAI/skills/blob/main/INSTALL.md.
