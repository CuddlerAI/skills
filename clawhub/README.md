# Cuddler for OpenClaw

Make AI videos and images on your own Cuddler account from OpenClaw. Ask in any chat your OpenClaw answers: the skill shows the price first, Cuddler renders after your OK, and the finished file comes back in the chat.

## What you can ask

| Skill | Ask OpenClaw |
|---|---|
| `cuddler-setup` | "Connect my Cuddler account": sign in, see your plan, your credits and what your account can make |
| `cuddler-generate` | "Make a 10-second vertical clip of a paper boat in the rain": videos and images, priced before anything is spent |
| `cuddler-character-clip` | "Turn my character into a 15-second clip": one of your own Cuddler characters talking to the viewer |
| `cuddler-review` | "Review this clip before I post it": a local ffmpeg check with a pass, fix or reject verdict |

## Install and sign in

<!-- claims:install.openclaw -->
```bash
openclaw plugins install clawhub:cuddler
openclaw mcp add cuddler --url https://mcp.cuddler.ai/mcp --transport streamable-http --auth oauth --header X-Cuddler-Source=plugin --timeout 240
openclaw mcp login cuddler
```
<!-- /claims:install.openclaw -->

The first command installs the four skills and the Cuddler MCP server. The other two sign you in from a terminal. In the Control UI you can skip them: open **Plugins → Cuddler → Accounts** and choose **Connect**.

Either way a Cuddler page opens in your browser. Sign in, allow the connection and tick **Spend credits** if you want to make images and videos; it is never pre-selected. If your browser runs on another machine than OpenClaw, the page it lands on can't load: copy the `code` value from its address and run `openclaw mcp login cuddler --code <code>`. The Cuddler tools appear in your next session.

## What you need

- OpenClaw 2026.9.9 or newer.
- A Cuddler account on a paid plan (Lite, Pro or Ultra), or in Cuddler's Creator Partnership Program. The setup skill tells you what your plan can make.
- For `cuddler-review`: `curl`, `ffmpeg` and `ffprobe` on the machine OpenClaw runs on (and network access in OpenClaw's sandbox, if you turn it on). Finished images and clips come back in your chat without them.

## Credits

<!-- claims:credits -->
Renders spend credits from your own Cuddler account: the quote is the price. Your agent shows the price first and waits for your OK.
<!-- /claims:credits -->

<!-- claims:limits -->
Cuddler's server charges at most the quoted price for each render, and in agents that support it, it also asks you in the agent's own dialog before each paid call. There is no separate daily cap unless Cuddler sets one: your credit balance is the limit.
<!-- /claims:limits -->

<!-- claims:plans -->
Connecting needs a paid Cuddler plan (Lite, Pro or Ultra) or a place in Cuddler's Creator Partnership Program; free plans, trials and gifted plans can't connect. Videos need a plan that includes video. The setup skill tells you what your account can make.
<!-- /claims:plans -->

OpenClaw runs Cuddler's tools without stopping to ask, so the price question in your chat is the go-ahead: the skill makes nothing until you reply proceed. Anyone who can message your OpenClaw can ask for a render and reply too, so connect Cuddler to an OpenClaw that only you talk to, or limit who can use it.

## Privacy and safety

- You sign in on cuddler.ai in your own browser; OpenClaw never sees your password. Disconnect any time on cuddler.ai under Settings → Developer API tokens, and remove the plugin with `openclaw plugins uninstall cuddler`.
- Your prompts and reference pictures go to Cuddler to make the render. Finished files come back in your chat, which fetches them from Cuddler's storage.
- Everything you make stays private in your Cuddler account until you publish it in the Cuddler app.
- The skills decline minors and school settings, real people, and other people's characters and brands.
- The plugin adds one fixed header, `X-Cuddler-Source: plugin`, to its requests to the Cuddler MCP server, so Cuddler can count the connections that come from the plugin. It says nothing about you or your machine.

## Source and support

The skills are open source at [CuddlerAI/skills](https://github.com/CuddlerAI/skills) under the MIT license; the Cuddler name and logo are trademarks ([TRADEMARKS.md](https://github.com/CuddlerAI/skills/blob/main/TRADEMARKS.md)). Report problems in the [issues](https://github.com/CuddlerAI/skills/issues) and security issues privately as [SECURITY.md](https://github.com/CuddlerAI/skills/blob/main/SECURITY.md) describes.

[Cuddler](https://cuddler.ai/?utm_source=clawhub&utm_medium=readme&utm_campaign=agent_skills) · [Cuddler in ChatGPT, Claude and other assistants](https://cuddler.ai/mcp?utm_source=clawhub&utm_medium=readme&utm_campaign=agent_skills)
