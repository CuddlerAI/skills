# Security

## Report a problem privately

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Please don't open a public issue for a security problem.

Useful to include: what you did, what happened, which agent and version, and whether any account or credits were affected. We acknowledge reports within a few working days.

In scope: the skills, scripts and manifests in this repository, and how they use the Cuddler MCP server. Problems in the Cuddler service itself are welcome through the same channel, or through [Cuddler support](https://cuddler.ai/support).

Supported versions: the latest release. Older versions get no fixes; update the plugin instead.

## If a connection may be compromised

If you think an agent, a token or a session connected to your Cuddler account was exposed:

1. On cuddler.ai, open Settings → Developer API tokens and revoke the connection (or all of them).
2. Remove the Cuddler plugin or MCP server from the agent, then reinstall and sign in again.
3. Check your recent creations and credits in the Cuddler app, and tell us through the report above.

## How the skills are built to behave

- They reach Cuddler only through the Cuddler MCP tools and the links those tools return, over https only.
- They never ask for, print or read your credentials; signing in happens in your browser.
- Every paid render is priced first and runs only after you say so; larger renders also need your approval in the browser.

These are instructions to an AI model and to the host that runs it, and a model or a host can stray from them. Independently of the skills, Cuddler's server caps every paid call at the `maxCredits` the skill sends (never above the quote), asks you in your browser above your plan's approval threshold, stops at each connection's daily budget, and spends nothing unless you allowed spending credits when you signed in. Those limits hold even when a host runs tools without asking.
