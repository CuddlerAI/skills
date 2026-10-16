// mcp-registry.mjs — the rules for server.json, the Cuddler MCP server's entry in the official MCP Registry
// (registry.modelcontextprotocol.io). No dependencies; Node.js 20+. validate.mjs runs these checks on every pull request;
// .github/workflows/mcp-registry-publish.yml publishes the file when someone runs it by hand.
//
// The registry keeps every published version for good and lets other directories copy the entry, so the checks hold
// server.json to what the registry accepts and to what the rest of the repository already says about the server.

/** The entry's name: cuddler.ai in reverse-DNS form. The registry checks a DNS TXT record on cuddler.ai before it publishes. */
export const REGISTRY_NAME = "ai.cuddler/cuddler";
/** The domain whose TXT record proves the name. */
export const REGISTRY_DOMAIN = "cuddler.ai";
/** The server.json schema the entry follows; move it only after reading what the new schema changed. */
export const REGISTRY_SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
/** The registry refuses a longer title or description. */
export const REGISTRY_TEXT_MAX = 100;
/** The only key under _meta the registry keeps, and its size limit in bytes of JSON. */
const PUBLISHER_META = "io.modelcontextprotocol.registry/publisher-provided";
const PUBLISHER_META_MAX = 4096;
const TOP_LEVEL_KEYS = new Set(["$schema", "name", "title", "description", "version", "websiteUrl", "repository", "icons", "remotes", "packages", "_meta"]);
const ICON_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]);
const ICON_SRC_MAX = 255;

/** True when `url` is an https address on cuddler.ai or one of its subdomains. */
function onCuddler(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === REGISTRY_DOMAIN || u.hostname.endsWith(`.${REGISTRY_DOMAIN}`));
  } catch {
    return false;
  }
}

/**
 * What is wrong with a parsed server.json, as a list of messages (empty when nothing is).
 * @param {unknown} entry the parsed file
 * @param {{ mcpUrl?: string, repository?: string, displayName?: string }} expected what the rest of the repository says:
 *   the server address (claims.json mcp.url, which .mcp.json uses too), this repository's URL and the display name
 */
export function serverJsonProblems(entry, { mcpUrl, repository, displayName } = {}) {
  const problems = [];
  const add = (message) => problems.push(message);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return ["must be a JSON object"];

  for (const key of Object.keys(entry)) if (!TOP_LEVEL_KEYS.has(key)) add(`"${key}" is not a server.json field; the registry schema rejects or drops it`);
  if (entry.$schema !== REGISTRY_SCHEMA) add(`$schema is "${entry.$schema ?? "missing"}"; the entry follows ${REGISTRY_SCHEMA}`);

  if (entry.name !== REGISTRY_NAME) add(`name is "${entry.name ?? "missing"}"; the registry name is ${REGISTRY_NAME}, proven through ${REGISTRY_DOMAIN}`);
  for (const key of ["title", "description"]) {
    const text = entry[key];
    if (typeof text !== "string" || !text.trim()) add(`${key} is required`);
    else if (text.length > REGISTRY_TEXT_MAX) add(`${key} is ${text.length} characters; the registry allows ${REGISTRY_TEXT_MAX}`);
  }
  if (displayName && typeof entry.title === "string" && entry.title !== displayName) add(`title "${entry.title}" differs from the display name "${displayName}"`);

  // Plain x.y.z: the registry never takes a version twice, and a prerelease such as 1.0.0-1 would sort below 1.0.0 and
  // not become the latest.
  if (typeof entry.version !== "string" || !/^\d+\.\d+\.\d+$/.test(entry.version)) {
    add(`version is "${entry.version ?? "missing"}"; use a plain x.y.z, new for each publish`);
  }

  if (typeof entry.websiteUrl !== "string" || !onCuddler(entry.websiteUrl)) add(`websiteUrl must be an https page on ${REGISTRY_DOMAIN}`);

  const repo = entry.repository;
  if (!repo || typeof repo !== "object") add("repository is required, so people can find the skills and the issue tracker");
  else {
    if (repository && repo.url !== repository) add(`repository.url is "${repo.url ?? "missing"}"; this repository is ${repository}`);
    if (repo.source !== "github") add(`repository.source must be "github"`);
    if ("id" in repo && !/^\d+$/.test(String(repo.id))) add("repository.id must be GitHub's numeric repository id");
    if ("subfolder" in repo) add("repository.subfolder doesn't apply: the entry describes the whole repository");
  }

  if (!Array.isArray(entry.icons) || entry.icons.length === 0) add("icons: list at least one icon");
  else {
    entry.icons.forEach((icon, i) => {
      const where = `icons[${i}]`;
      if (typeof icon?.src !== "string" || !onCuddler(icon.src)) add(`${where}.src must be an https address on ${REGISTRY_DOMAIN}, the server's own domain, so hosts that only trust it show the icon`);
      else if (icon.src.length > ICON_SRC_MAX) add(`${where}.src is longer than ${ICON_SRC_MAX} characters`);
      if (!ICON_TYPES.has(icon?.mimeType)) add(`${where}.mimeType must be one of ${[...ICON_TYPES].join(", ")}`);
      if (icon?.sizes !== undefined && (!Array.isArray(icon.sizes) || !icon.sizes.every((s) => /^(\d+x\d+|any)$/.test(s)))) add(`${where}.sizes must list sizes such as "512x512"`);
    });
  }

  if (!Array.isArray(entry.remotes) || entry.remotes.length !== 1) add("remotes must list exactly one server, the Cuddler MCP server");
  else {
    const remote = entry.remotes[0] ?? {};
    if (remote.type !== "streamable-http") add(`remotes[0].type must be "streamable-http"`);
    if (mcpUrl && remote.url !== mcpUrl) add(`remotes[0].url is "${remote.url ?? "missing"}"; the server is ${mcpUrl} (claims.json mcp.url, as in .mcp.json)`);
    // The plugin's source header says a connection came from this repository's packages; an entry any client can copy
    // must not send it. Sign-in is OAuth, so there is nothing else to ask for either.
    if ("headers" in remote) add("remotes[0].headers: the entry sends no headers (the plugin source header is for this repository's packages, and sign-in is OAuth)");
    if ("variables" in remote) add("remotes[0].variables: the address takes no variables");
  }
  if ("packages" in entry) add("packages: the Cuddler server is remote only; there is no package to install");

  if (entry._meta !== undefined) {
    const meta = entry._meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) add("_meta must be an object");
    else {
      for (const key of Object.keys(meta)) if (key !== PUBLISHER_META) add(`_meta."${key}" is dropped by the registry; only "${PUBLISHER_META}" is kept`);
      if (meta[PUBLISHER_META] !== undefined && Buffer.byteLength(JSON.stringify(meta[PUBLISHER_META])) > PUBLISHER_META_MAX) {
        add(`_meta."${PUBLISHER_META}" is over ${PUBLISHER_META_MAX} bytes of JSON`);
      }
    }
  }
  return problems;
}
