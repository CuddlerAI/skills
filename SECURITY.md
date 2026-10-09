# Security

## Report a problem privately

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Please don't open a public issue for a security problem.

Useful to include: what you did, what happened, which agent and version, and whether any account or credits were affected. We reply within a few working days.

In scope: the skills, scripts and manifests in this repository, and how they use the Cuddler MCP server. Problems in the Cuddler service itself are welcome through the same channel.

## If a connection may be compromised

If you think an agent, a token or a session connected to your Cuddler account was exposed:

1. On cuddler.ai, open Settings → Developer API tokens and revoke the connection (or all of them).
2. Remove the Cuddler plugin or MCP server from the agent, then reinstall and sign in again.
3. Check your recent creations and credits in the Cuddler app, and tell us through the report above.

## What the skills promise

- They reach Cuddler only through the Cuddler MCP tools and the signed links those tools return.
- They never ask for, print or read your credentials; signing in happens in your browser.
- Every paid render is priced first and runs only after you say so; larger renders also need your approval in the browser.
