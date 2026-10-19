# Security

## Report a problem privately

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Please don't open a public issue for a security problem.

Useful to include: what you did, what happened, which agent and version, and whether any account or credits were affected. We acknowledge reports within a few working days.

In scope: the skills, the save hook, scripts and manifests in this repository, and how they use the Cuddler MCP server. Problems in the Cuddler service itself are welcome through the same channel, or through [Cuddler support](https://cuddler.ai/support).

Supported versions: the latest release. Older versions get no fixes; update the plugin instead.

## If a connection may be compromised

If you think an agent, a token or a session connected to your Cuddler account was exposed:

1. On cuddler.ai, open Settings → Developer API tokens and revoke the connection (or all of them).
2. Remove the Cuddler plugin or MCP server from the agent, then reinstall and sign in again.
3. Check your recent creations and credits in the Cuddler app, and tell us through the report above.

## How the skills are built to behave

- They reach Cuddler only through the Cuddler MCP tools and the links those tools return, over https only.
- They never ask for, print or read your credentials; signing in happens in your browser.
- Every paid render is priced first and runs only after you say so.
- The plugin's save hook is the one piece of code that runs on its own; the next section says what it does.

These are instructions to an AI model and to the host that runs it, and a model or a host can stray from them. Independently of the skills, Cuddler's server caps every paid call at the `maxCredits` the skill sends (never above the quote), spends nothing unless you allowed spending credits when you signed in, and, in agents that support it, asks you in the agent's own dialog before each paid call. The cap and the sign-in permission hold even when a host runs tools without asking.

## The save hook

The Claude Code and Codex plugin installed from this repository has one hook, `hooks/save-media.mjs`. It runs after the Cuddler tools that can return a finished file (`get_video`, `get_download_link`, `create_image` and `get_image`, and `download_video` of the Cuddler Platform server) and saves that file on your computer. It is the only part of the plugin that runs by itself, and it uses the network, so here is exactly what it does:

- **Where it fetches from.** Only `https://` links on `asset.cuddler.ai` and on Cuddler's own storage account (one fixed `r2.cloudflarestorage.com` host, in Cuddler's two buckets); the list is fixed in the script. Any other host, a link with a user name or another port, and redirects are refused.
- **What it fetches.** At most 500 MB for a video and 50 MB for an image. The Content-Type and the first bytes must be an MP4, JPEG, PNG or WebP of the kind expected. It checks the free disk space first, writes to a `.part` file, renames it when it is complete, and deletes it on any failure. A file it already saved is not fetched again.
- **Where it writes.** Only into `cuddler-out/` in the session's project folder, which it gives a `.gitignore` holding `*`, or into `~/Downloads/Cuddler/` when the session has no project folder (the home folder or `/`). The file name is its own, `<yyyymmdd-hhmm>-<model>-<id>.<ext>`, never a path from a link or a tool result. A project's `cuddler-out/` that is a symbolic link is not written through, since a cloned repository could point it anywhere; the file goes to `~/Downloads/Cuddler/` instead.
- **What it sends and runs.** Nothing: no telemetry, no requests besides the download, nothing it finds in a result is run, and no credential file is read. It follows `HTTPS_PROXY` and `NO_PROXY` the way curl does, for plain `http://` proxies.
- **What it tells the agent.** A short note with the saved file's path, relative to the project or starting with `~`, so no home folder path lands in a conversation you share. No link, no prompt.
- **How to control it.** `CUDDLER_SAVE_MEDIA=0` turns it off. `CUDDLER_OPEN_AFTER_SAVE=1` opens each saved file with the system's default app. Codex runs a plugin's hooks only after you review and trust them. Without Node.js 18 or later it does nothing, and any failure is silent: the skill then downloads the file itself.
- **Where it isn't.** The package for the ChatGPT and Codex plugin directory and the ClawHub package for OpenClaw don't contain it.
