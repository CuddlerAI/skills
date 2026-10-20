#!/usr/bin/env node
// save-media.mjs — the plugin's PostToolUse hook: saves a finished Cuddler video, image, voiceover or music take to disk.
// No dependencies; Node.js 18+.
//
// Claude Code and Codex run it after a Cuddler tool answers (hooks/hooks.json lists which), with the hook input as JSON
// on stdin. It does nothing until the answer holds a finished file: a ready video's `files` or a download link's
// `files`, an image's `url`, a finished voiceover's or music request's `files`, or a succeeded Platform job's
// `output.url`. Then it fetches that file, from Cuddler's own
// storage only, into <project>/cuddler-out/ (or ~/Downloads/Cuddler/ when the session has no project folder) under a
// name it makes itself, and tells the agent where the file is, as a path that names no home directory.
//
// What it will and won't do:
// - It fetches only https links on asset.cuddler.ai and on Cuddler's own storage host and buckets (ALLOWED_HOSTS),
//   follows no redirects, and runs nothing it finds in a result.
// - A video is at most 500 MB, an image or an audio file at most 50 MB; the Content-Type and the first bytes must be an
//   MP4, JPEG, PNG, WebP or MP3 of the expected kind, and the disk must have room. A file is written as <name>.part and renamed when it is
//   complete; anything that fails is deleted.
// - One file per id and variant: a file already saved is not fetched again.
// - It prints no link and no prompt. When it can't save a file, it says nothing and the skill downloads the file itself.
// - It goes through an http:// proxy that HTTPS_PROXY or ALL_PROXY names, as curl does. With any other proxy set, it
//   fetches nothing, so the download never leaves the route the user chose.
// - CUDDLER_SAVE_MEDIA=0 turns it off; CUDDLER_OPEN_AFTER_SAVE=1 opens the saved video, image or audio in the system's default app.
//
// It exits 0 in every case, so a failure never blocks the agent.

import { spawn } from "node:child_process";
import { createWriteStream, unlinkSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { lstat, mkdir, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request } from "node:https";
import { homedir } from "node:os";
import { join, parse, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { connect as tlsConnect } from "node:tls";
import { pathToFileURL } from "node:url";

/**
 * The only places a file is fetched from: host → the path prefixes allowed on it (null: any path). The second host is
 * the S3 endpoint of Cuddler's own storage account, which signs its short-lived download links; any other account on
 * the same storage service is refused.
 */
export const ALLOWED_HOSTS = Object.freeze({
  "asset.cuddler.ai": null,
  "4e8dd0f84c1d428e392189a299a9fa2c.r2.cloudflarestorage.com": Object.freeze(["/cuddler-media/", "/cuddler-media-private/"]),
});

export const LIMITS = Object.freeze({
  videoBytes: 500 * 1024 * 1024,
  imageBytes: 50 * 1024 * 1024,
  audioBytes: 50 * 1024 * 1024,
  /** Room left on the disk after the file, at least. */
  headroomBytes: 64 * 1024 * 1024,
  /** The hook input; a larger one is not a Cuddler answer. */
  inputBytes: 16 * 1024 * 1024,
  /** One whole run, under the 300-second timeout in hooks.json. */
  runMs: 240_000,
  /** Reaching the storage host (name lookup, connection, TLS, the first answer) may take this long, once per run. */
  connectMs: 10_000,
  /** A download that sends nothing for this long is dropped. */
  idleMs: 30_000,
  /** A .part file older than this is left over from a run that died, and is replaced. */
  stalePartMs: 15 * 60_000,
});

/** The folder made in a project, and the fallback under the home directory. */
export const PROJECT_DIR = "cuddler-out";
export const FALLBACK_DIR = ["Downloads", "Cuddler"];

/** Tool names the hook acts on: an MCP server whose name says Cuddler, and one of these tools. Any case. */
const TOOL_NAME = /^mcp__(.+)__(get_video|get_download_link|create_image|get_image|download_video|get_speech|get_music)$/i;

const FORMATS = Object.freeze({
  mp4: Object.freeze({ kind: "video", types: ["video/mp4"] }),
  jpg: Object.freeze({ kind: "image", types: ["image/jpeg", "image/jpg"] }),
  png: Object.freeze({ kind: "image", types: ["image/png"] }),
  webp: Object.freeze({ kind: "image", types: ["image/webp"] }),
  mp3: Object.freeze({ kind: "audio", types: ["audio/mpeg", "audio/mp3"] }),
});
/** Storage may label any file this way; the first bytes decide then. */
const GENERIC_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

// ── what the tool answered ──────────────────────────────────────────────────

/** The tool part of a Cuddler tool name, lower-case, or null for any other tool. */
export function cuddlerTool(name) {
  const match = TOOL_NAME.exec(String(name ?? ""));
  if (!match || !/cuddler/i.test(match[1])) return null;
  return match[2].toLowerCase();
}

/** The JSON object or array in one text: plain, or inside the server's <untrusted-user-content> block. Null otherwise. */
export function parseText(text) {
  if (typeof text !== "string") return null;
  let body = text.trim();
  if (body.startsWith("<untrusted-user-content")) {
    const open = body.indexOf("\n");
    const close = body.lastIndexOf("\n</untrusted-user-content>");
    if (open < 0 || close <= open) return null;
    body = body.slice(open + 1, close);
  }
  if (!body.startsWith("{") && !body.startsWith("[")) return null;
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

const looksLikeAnswer = (value) =>
  ["video", "clip", "image", "files", "speech", "music"].some((key) => key in value) || typeof value.object === "string";

/**
 * Every answer object in a tool result, however the host hands it over: the MCP result ({ content, structuredContent }),
 * its content blocks alone, one text, the parsed object itself, or any of these inside a host's own wrapper (looked
 * for a few levels deep). An error result gives nothing.
 */
export function resultObjects(response, depth = 0) {
  if (response == null || depth > 4) return [];
  if (typeof response === "string") {
    const parsed = parseText(response);
    if (!parsed) return [];
    return !Array.isArray(parsed) && looksLikeAnswer(parsed) ? [parsed] : resultObjects(parsed, depth + 1);
  }
  if (Array.isArray(response)) return response.flatMap((item) => resultObjects(item, depth + 1));
  if (typeof response !== "object" || response.isError === true) return [];
  if (response.type === "text" && typeof response.text === "string") return resultObjects(response.text, depth + 1);
  if (looksLikeAnswer(response)) return [response];
  return Object.values(response).flatMap((value) => resultObjects(value, depth + 1));
}

/**
 * The finished files one answer offers, as { kind: "video" | "poster" | "image" | "audio", url, id, model, createdAt,
 * watermarked, audio ("voiceover" | "music"), take }. Nothing until the work is done: a video that is still rendering,
 * a failed job and an error give an empty list.
 */
export function mediaTargets(answer) {
  if (!answer || typeof answer !== "object") return [];
  const targets = [];
  const add = (kind, url, from) => {
    if (typeof url !== "string" || !url) return;
    targets.push({ kind, url, id: from.id, model: from.model, createdAt: from.createdAt, watermarked: from.watermarked === true, audio: from.audio, take: from.take });
  };
  const files = (list, from) => {
    if (!Array.isArray(list)) return;
    for (const file of list) {
      if (file?.kind === "video") add("video", file.url, { ...from, watermarked: file.watermarked });
      else if (file?.kind === "poster") add("poster", file.url, from);
    }
  };

  // The Cuddler MCP server: get_video's ready video carries the download links get_download_link gives.
  const video = answer.video ?? answer.clip;
  if (video && typeof video === "object" && video.status === "ready") {
    files(video.files, { id: video.id, model: video.modelId, createdAt: video.createdAt });
  }
  // get_download_link
  if (Array.isArray(answer.files) && (answer.videoId || answer.clipId)) files(answer.files, { id: answer.videoId ?? answer.clipId });
  // get_speech and get_music: a finished request's takes (`partial`: the ones that came back). A music request of more
  // than one take numbers its files, so take 2 never stands in for take 1.
  for (const [key, audio] of [["speech", "voiceover"], ["music", "music"]]) {
    const job = answer[key];
    if (!job || typeof job !== "object" || (job.status !== "ready" && job.status !== "partial") || !Array.isArray(job.files)) continue;
    const several = (Number(job.count) || 1) > 1 || job.files.length > 1;
    for (const file of job.files) {
      if (file?.kind !== "audio") continue;
      const take = several && Number.isInteger(file.position) ? file.position + 1 : undefined;
      add("audio", file.url, { id: job.id, model: job.modelId, createdAt: job.createdAt, audio, take });
    }
  }
  // create_image and get_image: the image is done when it has its link.
  const image = answer.image;
  if (image && typeof image === "object" && (image.status === undefined || image.status === "ready" || image.status === "succeeded")) {
    add("image", image.url, { id: image.id, model: image.modelId, createdAt: image.createdAt });
  }

  // The Cuddler Platform MCP server.
  if ((answer.object === "video" || answer.object === "image") && answer.status === "succeeded") {
    add(answer.object, answer.output?.url, { id: answer.id, model: answer.model, createdAt: answer.created_at });
  }
  if ((answer.object === "speech" || answer.object === "music") && answer.status === "succeeded") {
    const audio = answer.object === "speech" ? "voiceover" : "music";
    add("audio", answer.output?.url, { id: answer.id, model: answer.model, createdAt: answer.created_at, audio });
  }
  if (answer.object === "video_download") add("video", answer.url, { id: answer.id, watermarked: answer.watermarked });

  const seen = new Set();
  return targets.filter((t) => !seen.has(t.url) && seen.add(t.url));
}

// ── where a file may come from ──────────────────────────────────────────────

/** The URL when it is an https link on an allowed host and path, else null. */
export function allowedUrl(raw) {
  if (typeof raw !== "string" || raw.length > 8192) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (!Object.hasOwn(ALLOWED_HOSTS, url.hostname)) return null;
  const prefixes = ALLOWED_HOSTS[url.hostname];
  if (prefixes && !prefixes.some((prefix) => url.pathname.startsWith(prefix))) return null;
  if (url.pathname.split("/").some((part) => part === ".." || part === "." || /%2e%2e|%2f|%5c/i.test(part))) return null;
  return url;
}

// ── what the file is ────────────────────────────────────────────────────────

/** The format the first bytes show (mp4, jpg, png, webp, mp3), or null. */
export function sniff(head) {
  const bytes = Buffer.from(head ?? []);
  if (bytes.length >= 8 && bytes.toString("latin1", 4, 8) === "ftyp") return "mp4";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
  // MP3: an ID3 tag, or straight into an MPEG audio frame (sync bits set, a valid version, Layer III).
  if (bytes.length >= 3 && bytes.toString("latin1", 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && ((bytes[1] >> 3) & 0x3) !== 1 && ((bytes[1] >> 1) & 0x3) === 1) return "mp3";
  return null;
}

const mediaKind = (kind) => (kind === "video" || kind === "audio" ? kind : "image");

/** Whether a response's Content-Type fits the kind of file expected. An empty type doesn't. */
export function typeFits(kind, contentType) {
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (GENERIC_TYPES.has(type)) return true;
  return Object.values(FORMATS).some((f) => f.kind === mediaKind(kind) && f.types.includes(type));
}

/** Whether the sniffed format fits the kind expected and a specific Content-Type. */
export function formatFits(kind, contentType, format) {
  const spec = format && FORMATS[format];
  if (!spec || spec.kind !== mediaKind(kind)) return false;
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return GENERIC_TYPES.has(type) || spec.types.includes(type);
}

export const capFor = (kind) => (kind === "video" ? LIMITS.videoBytes : kind === "audio" ? LIMITS.audioBytes : LIMITS.imageBytes);

// ── the file name ───────────────────────────────────────────────────────────

/** yyyymmdd-hhmm in UTC, from an ISO time, or from `now` when that doesn't parse. */
export function stamp(iso, now = new Date()) {
  const parsed = typeof iso === "string" ? new Date(iso) : null;
  const d = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** A model id as a file-name part: lower-case letters, digits, dots and single hyphens. */
export function modelPart(model) {
  const part = String(model ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40).replace(/[-.]+$/, "");
  return part || null;
}

/** An id as a file-name part: letters, digits and underscores only, so it never holds a separator; null if empty. */
export function idPart(id) {
  const part = String(id ?? "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  return part || null;
}

/** What tells two files of one id apart: the poster, a video with the Cuddler.ai mark, a music request's takes. */
export function variantOf(target) {
  if (target.kind === "poster") return "-poster";
  if (target.kind === "video" && target.watermarked) return "-watermarked";
  if (target.kind === "audio" && Number.isInteger(target.take) && target.take > 0) return `-take${target.take}`;
  return "";
}

const EXTENSIONS = { video: ["mp4"], poster: ["jpg", "png", "webp"], image: ["jpg", "png", "webp"], audio: ["mp3"] };
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The name of a file already saved for this id and variant in `names`, or null. */
export function savedName(names, id, variant, kind) {
  const pattern = new RegExp(`^\\d{8}-\\d{4}-[a-z0-9.-]+-${escape(id)}${escape(variant)}\\.(?:${EXTENSIONS[kind].join("|")})$`);
  return names.find((name) => pattern.test(name)) ?? null;
}

/** The "<yyyymmdd-hhmm>-<model>" start of any file saved for this id, so a later variant sorts next to it. */
export function savedPrefix(names, id) {
  const pattern = new RegExp(`^(\\d{8}-\\d{4}-[a-z0-9.-]+)-${escape(id)}(?:-poster|-watermarked|-take\\d+)?\\.(?:mp4|jpg|png|webp|mp3)$`);
  for (const name of names) {
    const match = pattern.exec(name);
    if (match) return match[1];
  }
  return null;
}

/** The name of a file without its extension: <yyyymmdd-hhmm>-<model>-<id><variant>. */
export function fileStem(target, names, now = new Date()) {
  const id = idPart(target.id);
  if (!id) return null;
  const model = modelPart(target.model);
  const prefix = model ? `${stamp(target.createdAt, now)}-${model}` : (savedPrefix(names, id) ?? `${stamp(target.createdAt, now)}-${mediaKind(target.kind)}`);
  return `${prefix}-${id}${variantOf(target)}`;
}

// ── where the file goes ─────────────────────────────────────────────────────

const samePath = (a, b, platform) => (platform === "win32" || platform === "darwin" ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Whether `cwd` is a project folder: not a filesystem root, not the home directory and not above it. */
export function isProjectDir(cwd, home, platform = process.platform) {
  if (typeof cwd !== "string" || !cwd) return false;
  const dir = resolve(cwd);
  if (samePath(dir, parse(dir).root, platform)) return false;
  const h = resolve(home);
  if (samePath(dir, h, platform)) return false;
  const above = (platform === "win32" || platform === "darwin" ? h.toLowerCase() : h).startsWith(
    (platform === "win32" || platform === "darwin" ? dir.toLowerCase() : dir) + sep,
  );
  return !above;
}

/** ~/Downloads/Cuddler, named to the agent with ~ so no home path reaches the conversation. */
export function fallbackDestination(home) {
  return { dir: join(home, ...FALLBACK_DIR), project: false, show: (name) => `~/${FALLBACK_DIR.join("/")}/${name}` };
}

/** The folder to save into, and how to name a file in it to the agent: relative in a project, ~/ outside one. */
export function destination(cwd, home, platform = process.platform) {
  if (isProjectDir(cwd, home, platform)) {
    return { dir: join(resolve(cwd), PROJECT_DIR), project: true, show: (name) => `${PROJECT_DIR}/${name}` };
  }
  return fallbackDestination(home);
}

/**
 * Makes the folder; in a project, also a .gitignore holding `*`, so the files stay out of the repository. A project's
 * cuddler-out/ that is a symbolic link is refused (a cloned repository could point it anywhere), and so is one that
 * another user owns or that anyone may write to.
 */
export async function prepare(dest) {
  await mkdir(dest.dir, { recursive: true });
  const info = await lstat(dest.dir);
  if (!info.isDirectory() && !(info.isSymbolicLink() && !dest.project && (await stat(dest.dir)).isDirectory())) {
    throw new Error("not a folder");
  }
  // In a project, also refuse a folder someone else made or anyone may write to (a shared /tmp, say).
  if (dest.project && typeof process.getuid === "function" && (info.uid !== process.getuid() || (info.mode & 0o002) !== 0)) {
    throw new Error("not the user's own folder");
  }
  if (dest.project) {
    try {
      await writeFile(join(dest.dir, ".gitignore"), "*\n", { flag: "wx" });
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
    }
  }
}

/** Free bytes on the disk that holds `dir`, or null when Node can't tell (statfs came in 18.15). */
async function freeBytes(dir) {
  if (typeof fsp.statfs !== "function") return null;
  const s = await fsp.statfs(dir);
  return Number(s.bavail) * Number(s.bsize);
}

// ── fetching ────────────────────────────────────────────────────────────────

/** An error from reaching the storage host, not from the file: the run stops trying the other files. */
const networkError = (message) => Object.assign(new Error(message), { network: true });

/** .part files this run is writing, removed if the host stops the run (Esc, a timeout). */
const activeParts = new Set();

/**
 * GET over https without following redirects; resolves with the response. Reaching the host and getting the first
 * answer must take at most LIMITS.connectMs (a socket timeout starts only once connected), then the body may pause
 * for LIMITS.idleMs at most. fetchTo takes another `get` in tests.
 */
async function httpsGet(url, { signal, env = process.env } = {}) {
  const proxy = proxyFor(url, env);
  if (proxy === false) throw networkError("a proxy this script can't use");
  let inFlight = null;
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    inFlight?.destroy(networkError("connect timeout"));
  }, LIMITS.connectMs);
  try {
    const socket = proxy ? await tunnel(proxy, url, signal, (req) => (inFlight = req)) : null;
    if (late) {
      socket?.destroy();
      throw networkError("connect timeout");
    }
    return await new Promise((resolvePromise, reject) => {
      const options = { method: "GET", headers: { accept: "*/*", "user-agent": "cuddler-plugin-save-media" }, signal };
      // Through a proxy, TLS runs inside the tunnel and still checks the certificate of the storage host itself.
      if (socket) options.createConnection = () => tlsConnect({ socket, servername: url.hostname });
      const req = request(url, options);
      inFlight = req;
      req.on("response", resolvePromise);
      req.on("error", (e) => reject(Object.assign(e, { network: true })));
      req.setTimeout(LIMITS.idleMs, () => req.destroy(new Error("idle")));
      req.end();
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How to reach this URL: null to go direct (no proxy set, or NO_PROXY covers the host), the http:// proxy that
 * HTTPS_PROXY (or ALL_PROXY) names, or false when a proxy is set that this script can't use (socks, https://, a value
 * that doesn't parse). Curl reads the same variables; with false, the hook leaves the download to the skill's curl, so
 * a file never goes around the proxy the user chose.
 */
export function proxyFor(url, env = process.env) {
  const raw = env.HTTPS_PROXY || env.https_proxy || env.ALL_PROXY || env.all_proxy;
  if (!raw) return null;
  const host = url.hostname.toLowerCase();
  const bypass = String(env.NO_PROXY || env.no_proxy || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);
  if (bypass.some((entry) => entry === "*" || host === entry.replace(/^\*?\./, "") || host.endsWith(entry.startsWith(".") ? entry : `.${entry.replace(/^\*\./, "")}`))) {
    return null;
  }
  let proxy;
  try {
    proxy = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    return false;
  }
  return proxy.protocol === "http:" ? proxy : false;
}

/** A CONNECT tunnel through `proxy` to port 443 of the URL's host; `track` gets the request, so it can be cut short. */
function tunnel(proxy, url, signal, track) {
  return new Promise((resolvePromise, reject) => {
    const headers = { host: `${url.hostname}:443` };
    if (proxy.username) {
      const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      headers["proxy-authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }
    const req = httpRequest({ host: proxy.hostname, port: proxy.port || 80, method: "CONNECT", path: `${url.hostname}:443`, headers, signal });
    track(req);
    req.on("connect", (res, socket) => {
      if (res.statusCode === 200) return resolvePromise(socket);
      socket.destroy();
      reject(networkError(`proxy ${res.statusCode}`));
    });
    req.on("error", (e) => reject(Object.assign(e, { network: true })));
    req.end();
  });
}

/**
 * Streams one file into `part`, checking the status, the Content-Type, the size (declared and counted), the room on
 * the disk and the first bytes. Resolves with { format, bytes }; on any failure `part` is deleted and it rejects.
 */
export async function fetchTo(url, part, kind, { get = httpsGet, signal, env, free = freeBytes, cap = capFor(kind) } = {}) {
  const res = await get(url, { signal, env }).catch((e) => {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { network: e?.network ?? true });
  });
  let created = false;
  try {
    if (res.statusCode !== 200) throw new Error(`status ${res.statusCode}`);
    const contentType = res.headers["content-type"];
    if (!typeFits(kind, contentType)) throw new Error("content type");
    const declared = res.headers["content-length"] === undefined ? null : Number(res.headers["content-length"]);
    if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0 || declared > cap)) throw new Error("too large");
    const room = await free(resolve(part, ".."));
    if (room !== null && room < (declared ?? cap) + LIMITS.headroomBytes) throw new Error("disk full");

    let bytes = 0;
    let head = Buffer.alloc(0);
    let format = null;
    const guard = new Transform({
      transform(chunk, _enc, done) {
        bytes += chunk.length;
        if (bytes > cap) return done(new Error("too large"));
        if (!format) {
          head = Buffer.concat([head, chunk]);
          if (head.length < 12) return done();
          format = sniff(head);
          if (!formatFits(kind, contentType, format)) return done(new Error("not the expected file"));
          const first = head;
          head = null;
          return done(null, first);
        }
        done(null, chunk);
      },
      flush(done) {
        if (!format) return done(new Error("too short"));
        if (declared !== null && bytes !== declared) return done(new Error("incomplete"));
        done();
      },
    });
    const out = createWriteStream(part, { flags: "wx" });
    out.on("open", () => {
      created = true;
      activeParts.add(part);
    });
    await pipeline(res, guard, out, { signal });
    return { format, bytes };
  } catch (e) {
    res.destroy?.();
    if (created) await unlink(part).catch(() => {}); // never another run's .part
    activeParts.delete(part);
    throw e;
  }
}

/** Saves one target into `dest`. Resolves with { status: "saved" | "exists", name, bytes? } or null when it can't. */
export async function saveOne(target, dest, { get, signal, env, free, now = new Date() } = {}) {
  const url = allowedUrl(target.url);
  if (!url) return null;
  const id = idPart(target.id);
  if (!id) return null;
  const names = await readdir(dest.dir);
  const variant = variantOf(target);
  const existing = savedName(names, id, variant, target.kind);
  if (existing) return { status: "exists", name: existing };

  const stem = fileStem(target, names, now);
  const part = join(dest.dir, `${stem}.part`);
  try {
    const age = Date.now() - (await stat(part)).mtimeMs;
    if (age < LIMITS.stalePartMs) return null; // another run is saving it right now
    await unlink(part);
  } catch (e) {
    if (e?.code !== "ENOENT") return null;
  }
  const { format, bytes } = await fetchTo(url, part, target.kind, { get, signal, env, free });
  const name = `${stem}.${format}`;
  const final = join(dest.dir, name);
  try {
    if (await stat(final).then(() => true, () => false)) {
      await unlink(part).catch(() => {}); // a run that finished first saved the same file
      return { status: "exists", name };
    }
    await rename(part, final);
  } catch (e) {
    await unlink(part).catch(() => {});
    throw e;
  } finally {
    activeParts.delete(part);
  }
  return { status: "saved", name, bytes };
}

// ── after saving ────────────────────────────────────────────────────────────

/** The command that opens a file in the system's default app. */
export function openCommand(file, platform = process.platform) {
  if (platform === "darwin") return ["open", [file]];
  if (platform === "win32") return ["explorer.exe", [file]];
  return ["xdg-open", [file]];
}

function openFile(file) {
  const [command, args] = openCommand(file);
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

const size = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The note for the agent, naming each file by the path `show` gives. */
export function note(results, show) {
  const lines = results.map(({ target, result }) => {
    const what =
      target.kind === "poster" ? "the poster"
      : target.kind === "image" ? "the image"
      : target.kind === "audio" ? (target.take ? `${target.audio ?? "audio"} take ${target.take}` : `the ${target.audio ?? "audio"}`)
      : target.watermarked ? "the video, with the Cuddler.ai mark,"
      : "the video";
    return result.status === "saved" ? `saved ${what} to ${show(result.name)} (${size(result.bytes)})` : `${what} is already saved as ${show(result.name)}`;
  });
  const them = results.length > 1 ? "these files" : "this file";
  return `Cuddler plugin: ${lines.join("; ")}. Give the user ${them} instead of downloading again.`;
}

// ── the hook ────────────────────────────────────────────────────────────────

/**
 * One hook run, from its parsed input. Resolves with the text for the agent, or null when there is nothing to say.
 * `options` replaces the environment, home directory, network and clock in tests.
 */
export async function run(input, options = {}) {
  const env = options.env ?? process.env;
  if (env.CUDDLER_SAVE_MEDIA === "0") return null;
  if (!cuddlerTool(input?.tool_name)) return null;
  // One file once, however many times the answer carries it (the text and structuredContent both do).
  const seen = new Set();
  const targets = resultObjects(input.tool_response)
    .flatMap(mediaTargets)
    .filter((target) => {
      const url = allowedUrl(target.url);
      if (!url || proxyFor(url, env) === false) return false;
      const keys = [target.url, `${idPart(target.id)}${variantOf(target)}:${target.kind}`];
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });
  if (!targets.length) return null;

  const home = options.home ?? homedir();
  const platform = options.platform ?? process.platform;
  // Compared as real paths, so a home folder reached through a link still counts as home.
  const cwd = await realpath(typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd()).catch(() => null);
  const isDir = cwd !== null && (await stat(cwd).then((s) => s.isDirectory(), () => false));
  const realHome = await realpath(home).catch(() => home);
  let dest = isDir ? destination(cwd, realHome, platform) : fallbackDestination(home);
  try {
    await prepare(dest);
  } catch {
    if (!dest.project) return null;
    dest = fallbackDestination(home);
    try {
      await prepare(dest);
    } catch {
      return null;
    }
  }

  const results = [];
  for (const target of targets) {
    try {
      const result = await saveOne(target, dest, { ...options, env });
      if (result) results.push({ target, result });
    } catch (e) {
      if (e?.network) break; // the host can't be reached now: don't make the agent wait for every file
      // otherwise the skill downloads this one instead
    }
  }
  if (!results.length) return null;

  const opened = results.find(({ target, result }) => result.status === "saved" && target.kind !== "poster");
  if (opened && env.CUDDLER_OPEN_AFTER_SAVE === "1") (options.open ?? openFile)(join(dest.dir, opened.result.name));
  return note(results, dest.show);
}

async function readInput(stream) {
  let total = 0;
  const chunks = [];
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > LIMITS.inputBytes) return null;
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!(major >= 18) || process.stdin.isTTY) return;
  const signal = AbortSignal.timeout(LIMITS.runMs);
  const input = await readInput(process.stdin);
  if (!input) return;
  const text = await run(input, { signal });
  if (!text) return;
  const output = `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } })}\n`;
  await new Promise((done) => process.stdout.write(output, done)); // a pipe may still be writing when the process exits
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const quit = () => process.exit(0);
  process.on("uncaughtException", quit);
  process.on("unhandledRejection", quit);
  // Stopped by the host: delete what this run was writing, so the next run doesn't wait for a .part nobody finishes.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      for (const part of activeParts) {
        try {
          unlinkSync(part);
        } catch {}
      }
      quit();
    });
  }
  main().then(quit, quit);
}
