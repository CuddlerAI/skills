// Tests for hooks/save-media.mjs, the plugin's hook that saves finished files. No network: every download goes through a
// stand-in `get`, and every file lands in a temporary folder.
//
//   node --test scripts/save-media.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LIMITS,
  allowedUrl,
  cuddlerTool,
  destination,
  fetchTo,
  fileStem,
  formatFits,
  idPart,
  isProjectDir,
  mediaTargets,
  modelPart,
  note,
  openCommand,
  parseText,
  proxyFor,
  resultObjects,
  run,
  saveOne,
  savedName,
  savedPrefix,
  sniff,
  stamp,
  typeFits,
} from "../hooks/save-media.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "hooks/save-media.mjs");
const ASSET = "https://asset.cuddler.ai";
const STORAGE = "https://4e8dd0f84c1d428e392189a299a9fa2c.r2.cloudflarestorage.com";

// The first bytes of each format, padded to a small file.
const BYTES = {
  mp4: Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(52, 1)]),
  jpg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 2)]),
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, 3)]),
  webp: Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x38, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(48, 4)]),
  html: Buffer.from("<!doctype html><html><body>not a video</body></html>"),
};
const TYPES = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", webp: "image/webp", html: "text/html" };

/** A stand-in for the network: answers each URL from `files` ({ url: { body, type, status, length } }) and counts calls. */
function fakeGet(files) {
  const calls = [];
  const get = async (url) => {
    calls.push(String(url));
    const file = files[String(url)];
    const res = new PassThrough();
    res.statusCode = file?.status ?? (file ? 200 : 404);
    res.headers = {};
    if (file?.type !== undefined) res.headers["content-type"] = file.type;
    if (file?.length !== undefined) res.headers["content-length"] = String(file.length);
    else if (file?.body) res.headers["content-length"] = String(file.body.length);
    if (file?.noLength) delete res.headers["content-length"];
    process.nextTick(() => {
      if (file?.chunks) for (const chunk of file.chunks) res.write(chunk);
      else if (file?.body) res.write(file.body);
      res.end();
    });
    return res;
  };
  return { get, calls };
}

const roomy = async () => 10 * 1024 * 1024 * 1024;

function tempDirs() {
  const base = mkdtempSync(join(tmpdir(), "cuddler-save-media-"));
  const home = join(base, "home");
  const project = join(home, "code", "project");
  mkdirSync(project, { recursive: true });
  return { base, home, project, done: () => rmSync(base, { recursive: true, force: true }) };
}

const fence = (tool, body) => `<untrusted-user-content source="cuddler.${tool}">\n${JSON.stringify(body, null, 2)}\n</untrusted-user-content>`;

function readyVideo(overrides = {}) {
  return {
    id: "vid_test01",
    status: "ready",
    modelId: "seedance-2.0",
    createdAt: "2026-10-19T15:30:00.000Z",
    pageUrl: "https://cuddler.ai/studio/direct/vid_test01",
    files: [
      { kind: "video", url: `${STORAGE}/cuddler-media/studio/vid_test01.mp4?X-Amz-Signature=abc`, filename: "vid_test01.mp4", contentType: "video/mp4", expiresAt: "2026-10-19T15:40:00.000Z", watermarked: true },
      { kind: "poster", url: `${ASSET}/studio/vid_test01-poster.jpg`, filename: "vid_test01-poster.jpg", contentType: "image/jpeg", expiresAt: "2026-10-19T15:40:00.000Z" },
    ],
    ...overrides,
  };
}

// ── hosts ───────────────────────────────────────────────────────────────────

test("only asset.cuddler.ai and Cuddler's own storage account and buckets are fetched from", () => {
  for (const ok of [
    `${ASSET}/studio/abc/direct-final-x.mp4`,
    `${ASSET}:443/a.jpg`,
    `${STORAGE}/cuddler-media/studio/a.mp4?X-Amz-Signature=x`,
    `${STORAGE}/cuddler-media-private/platform/vid_a.mp4?X-Amz-Expires=3600`,
  ]) {
    assert.ok(allowedUrl(ok), `${ok} should be allowed`);
  }
  for (const bad of [
    "http://asset.cuddler.ai/a.mp4",
    ["https://user:pass", "asset.cuddler.ai/a.mp4"].join("@"), // credentials in the link
    "https://asset.cuddler.ai:8443/a.mp4",
    "https://asset.cuddler.ai.example.com/a.mp4",
    "https://asset.cuddler.ai./a.mp4",
    "https://evil.example/asset.cuddler.ai/a.mp4",
    "https://cuddler.ai/a.mp4",
    "https://mcp.cuddler.ai/a.mp4",
    "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/cuddler-media/a.mp4",
    "https://r2.cloudflarestorage.com/cuddler-media/a.mp4",
    "https://pub-1234.r2.dev/a.mp4",
    `${STORAGE}/other-bucket/a.mp4`,
    `${STORAGE}/cuddler-media-evil/a.mp4`,
    `${STORAGE}/cuddler-media/../other-bucket/a.mp4`,
    `${STORAGE}/cuddler-media/%2e%2e/other-bucket/a.mp4`,
    `${STORAGE}/cuddler-media/a%2f..%2fb.mp4`,
    `${STORAGE}/`,
    "file:///etc/passwd",
    "not a url",
    42,
  ]) {
    assert.equal(allowedUrl(bad), null, `${bad} should be refused`);
  }
});

// ── tools ───────────────────────────────────────────────────────────────────

const TOOL_CASES = [
  ["mcp__plugin_cuddler_cuddler__get_video", "get_video"],
  ["mcp__cuddler__get_download_link", "get_download_link"],
  ["mcp__claude_ai_Cuddler__create_image", "create_image"],
  ["mcp__Cuddler__GET_IMAGE", "get_image"],
  ["mcp__cuddler-platform__download_video", "download_video"],
  ["mcp__CUDDLER_API__get_video", "get_video"],
  ["mcp__cuddler__create_video", null],
  ["mcp__cuddler__quote_video", null],
  ["mcp__other__get_video", null],
  ["mcp__plugin_other_server__get_image", null],
  ["Bash", null],
  ["mcp__cuddler__get_video_references", null],
  ["", null],
];

test("the script acts on Cuddler's media tools only, in any case and under any server prefix", () => {
  for (const [name, tool] of TOOL_CASES) assert.equal(cuddlerTool(name), tool, name);
});

test("hooks.json matches the same tool names as the script, without inline regex flags", () => {
  const hooks = JSON.parse(readFileSync(join(ROOT, "hooks/hooks.json"), "utf8"));
  const entries = hooks.hooks.PostToolUse;
  assert.equal(entries.length, 1);
  const { matcher } = entries[0];
  assert.doesNotMatch(matcher, /\(\?[a-z]/, "JavaScript regexes take no inline flags such as (?i)");
  const re = new RegExp(matcher);
  for (const [name, tool] of TOOL_CASES) assert.equal(re.test(name), tool !== null, name);
  const [hook] = entries[0].hooks;
  assert.equal(hook.type, "command");
  assert.match(hook.command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/save-media\.mjs"/);
  assert.match(hook.command, /\|\| true$/, "a missing or old Node must not fail the tool call");
  assert.ok(hook.timeout * 1000 > LIMITS.runMs, "the hook's timeout must outlast the script's own deadline");
});

// ── results ─────────────────────────────────────────────────────────────────

test("tool results are read in every shape a host hands them over", () => {
  const body = { video: readyVideo() };
  const text = fence("get_video", body);
  assert.deepEqual(parseText(text), body);
  assert.equal(parseText("Retry after 5 seconds."), null);
  assert.equal(parseText("<untrusted-user-content>broken"), null);
  assert.deepEqual(resultObjects(text), [body]);
  assert.deepEqual(resultObjects([{ type: "text", text }]), [body]);
  assert.deepEqual(resultObjects({ content: [{ type: "text", text }], structuredContent: body }), [body, body]);
  assert.deepEqual(resultObjects(body), [body]);
  assert.deepEqual(resultObjects({ Ok: { content: [{ type: "text", text }] } }), [body], "a host's own wrapper");
  assert.deepEqual(resultObjects({ isError: true, content: [{ type: "text", text }] }), []);
  assert.deepEqual(resultObjects(null), []);
});

test("only finished work gives files: a ready video, a download link, a delivered image, a succeeded Platform job", () => {
  const ready = mediaTargets({ video: readyVideo() });
  assert.deepEqual(ready.map((t) => [t.kind, t.watermarked, t.model, t.id]), [["video", true, "seedance-2.0", "vid_test01"], ["poster", false, "seedance-2.0", "vid_test01"]]);
  assert.deepEqual(mediaTargets({ video: readyVideo({ status: "rendering" }) }), []);
  assert.deepEqual(mediaTargets({ video: readyVideo({ status: "failed" }) }), []);
  assert.deepEqual(mediaTargets({ video: readyVideo({ files: undefined }) }), [], "a ready video without files waits for get_download_link");
  const link = mediaTargets({ videoId: "vid_test01", files: readyVideo().files });
  assert.deepEqual(link.map((t) => [t.kind, t.model]), [["video", undefined], ["poster", undefined]]);
  assert.deepEqual(mediaTargets({ image: { id: "img_a", url: `${ASSET}/i.webp`, modelId: "nano-banana" } }).map((t) => t.kind), ["image"]);
  const platformVideo = { object: "video", id: "vid_p1", status: "succeeded", model: "seedance-2.0-mini", created_at: "2026-10-19T01:02:00Z", output: { url: `${STORAGE}/cuddler-media-private/p.mp4` } };
  assert.deepEqual(mediaTargets(platformVideo).map((t) => [t.kind, t.model, t.watermarked]), [["video", "seedance-2.0-mini", false]]);
  assert.deepEqual(mediaTargets({ ...platformVideo, status: "running", output: null }), []);
  assert.deepEqual(mediaTargets({ object: "image", id: "img_p1", status: "succeeded", model: "gpt-image-2", output: { url: `${STORAGE}/cuddler-media-private/p.png` } }).map((t) => t.kind), ["image"]);
  assert.deepEqual(mediaTargets({ object: "video_download", id: "vid_p1", watermarked: true, url: `${STORAGE}/cuddler-media/w.mp4` }).map((t) => [t.kind, t.watermarked]), [["video", true]]);
  assert.deepEqual(mediaTargets({ object: "balance" }), []);
});

// ── formats and caps ────────────────────────────────────────────────────────

test("the first bytes decide the format, and must fit the kind and the Content-Type", () => {
  assert.equal(sniff(BYTES.mp4), "mp4");
  assert.equal(sniff(BYTES.jpg), "jpg");
  assert.equal(sniff(BYTES.png), "png");
  assert.equal(sniff(BYTES.webp), "webp");
  assert.equal(sniff(BYTES.html), null);
  assert.equal(sniff(Buffer.from("RIFF0000WAVE")), null);
  assert.equal(sniff(Buffer.alloc(0)), null);

  assert.ok(typeFits("video", "video/mp4"));
  assert.ok(typeFits("video", "application/octet-stream"));
  assert.ok(typeFits("poster", "image/jpeg; charset=binary"));
  assert.ok(!typeFits("video", "image/jpeg"));
  assert.ok(!typeFits("image", "video/mp4"));
  assert.ok(!typeFits("video", "text/html"));
  assert.ok(!typeFits("video", undefined));

  assert.ok(formatFits("video", "video/mp4", "mp4"));
  assert.ok(formatFits("image", "application/octet-stream", "webp"));
  assert.ok(!formatFits("image", "image/png", "jpg"), "a PNG label on JPEG bytes");
  assert.ok(!formatFits("video", "video/mp4", "jpg"));
  assert.ok(!formatFits("image", "image/jpeg", null));
});

test("fetchTo streams a file that passes every check, and deletes it on any failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cuddler-fetch-"));
  const url = new URL(`${ASSET}/a.mp4`);
  const attempt = (file, kind = "video", options = {}) => {
    const part = join(dir, `${Math.random().toString(36).slice(2)}.part`);
    const { get } = fakeGet({ [String(url)]: file });
    return fetchTo(url, part, kind, { get, free: roomy, ...options }).then(
      (result) => ({ result, part, kept: existsSync(part) }),
      (error) => ({ error, part, kept: existsSync(part) }),
    );
  };
  try {
    const ok = await attempt({ body: BYTES.mp4, type: "video/mp4" });
    assert.deepEqual(ok.result, { format: "mp4", bytes: BYTES.mp4.length });
    assert.ok(readFileSync(ok.part).equals(BYTES.mp4));
    const split = await attempt({ chunks: [BYTES.png.subarray(0, 3), BYTES.png.subarray(3)], type: "image/png" }, "image");
    assert.equal(split.result?.format, "png", "a header split across chunks");

    const failures = {
      "a 403": [{ status: 403, body: BYTES.mp4, type: "video/mp4" }],
      "an HTML page": [{ body: BYTES.html, type: "text/html" }],
      "no Content-Type": [{ body: BYTES.mp4 }],
      "HTML labelled as a video": [{ body: BYTES.html, type: "video/mp4" }],
      "a JPEG where a video was expected": [{ body: BYTES.jpg, type: "application/octet-stream" }],
      "a declared size over the cap": [{ body: BYTES.mp4, type: "video/mp4", length: LIMITS.videoBytes + 1 }],
      "a counted size over the cap": [{ body: Buffer.concat([BYTES.mp4, Buffer.alloc(100)]), type: "video/mp4", noLength: true }, "video", { cap: 100 }],
      "a body shorter than declared": [{ body: BYTES.mp4, type: "video/mp4", length: BYTES.mp4.length + 10 }],
      "too few bytes to tell": [{ body: Buffer.from([0xff, 0xd8]), type: "image/jpeg" }, "image"],
      "a full disk": [{ body: BYTES.mp4, type: "video/mp4" }, "video", { free: async () => 1024 }],
    };
    for (const [what, [file, kind, options]] of Object.entries(failures)) {
      const out = await attempt(file, kind, options);
      assert.ok(out.error, `${what} must fail`);
      assert.equal(out.kept, false, `${what} must leave no .part file`);
    }
    assert.equal(LIMITS.videoBytes, 500 * 1024 * 1024);
    assert.equal(LIMITS.imageBytes, 50 * 1024 * 1024);

    // Another run's .part is never deleted.
    const busy = join(dir, "busy.part");
    writeFileSync(busy, "in progress");
    const { get } = fakeGet({ [String(url)]: { body: BYTES.mp4, type: "video/mp4" } });
    await assert.rejects(fetchTo(url, busy, "video", { get, free: roomy }));
    assert.equal(readFileSync(busy, "utf8"), "in progress");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── names ───────────────────────────────────────────────────────────────────

test("file names: <yyyymmdd-hhmm>-<model>-<id>, a variant for the poster and the marked video, nothing from a link", () => {
  const now = new Date("2026-10-19T23:59:00Z");
  assert.equal(stamp("2026-10-19T15:30:59.000Z", now), "20261019-1530");
  assert.equal(stamp("2026-10-20T01:05:00+08:00", now), "20261019-1705", "in UTC");
  assert.equal(stamp("not a date", now), "20261019-2359");
  assert.equal(stamp(undefined, now), "20261019-2359");
  assert.equal(modelPart("Seedance 2.0 HD"), "seedance-2.0-hd");
  assert.equal(modelPart("../../etc/passwd"), "etc-passwd");
  assert.equal(modelPart(""), null);
  assert.equal(idPart("vid_test01"), "vid_test01");
  assert.equal(idPart("../../.ssh/id_rsa"), "ssh_id_rsa");
  assert.equal(idPart("a/b\\c"), "a_b_c");
  assert.equal(idPart("..."), null);

  const video = { kind: "video", id: "vid_test01", model: "seedance-2.0", createdAt: "2026-10-19T15:30:00Z", watermarked: false };
  assert.equal(fileStem(video, [], now), "20261019-1530-seedance-2.0-vid_test01");
  assert.equal(fileStem({ ...video, watermarked: true }, [], now), "20261019-1530-seedance-2.0-vid_test01-watermarked");
  assert.equal(fileStem({ ...video, kind: "poster" }, [], now), "20261019-1530-seedance-2.0-vid_test01-poster");
  assert.equal(fileStem({ ...video, id: "/../" }, [], now), null);
  // A download link names no model: the file sorts next to what was saved for the same id, or says "video".
  const saved = ["20261019-1530-seedance-2.0-vid_test01-poster.jpg"];
  assert.equal(savedPrefix(saved, "vid_test01"), "20261019-1530-seedance-2.0");
  assert.equal(fileStem({ kind: "video", id: "vid_test01", watermarked: true }, saved, now), "20261019-1530-seedance-2.0-vid_test01-watermarked");
  assert.equal(fileStem({ kind: "video", id: "vid_other", watermarked: true }, saved, now), "20261019-2359-video-vid_other-watermarked");

  const names = ["20261019-1530-seedance-2.0-vid_test01-watermarked.mp4", "20261019-1530-seedance-2.0-vid_test01-poster.jpg", "x-vid_test01.mp4"];
  assert.equal(savedName(names, "vid_test01", "-watermarked", "video"), names[0]);
  assert.equal(savedName(names, "vid_test01", "-poster", "poster"), names[1]);
  assert.equal(savedName(names, "vid_test01", "", "video"), null, "the original is another variant");
  assert.equal(savedName(names, "test01", "-watermarked", "video"), null, "an id is matched whole");
});

// ── where files go ──────────────────────────────────────────────────────────

test("a project gets cuddler-out/; the home folder, a root or a folder above home gets ~/Downloads/Cuddler", () => {
  const home = "/Users/someone";
  assert.ok(isProjectDir("/Users/someone/code/app", home, "darwin"));
  assert.ok(isProjectDir("/srv/app", home, "linux"));
  assert.ok(!isProjectDir("/", home, "linux"));
  assert.ok(!isProjectDir(home, home, "linux"));
  assert.ok(!isProjectDir("/Users/SOMEONE", home, "darwin"), "macOS paths ignore case");
  assert.ok(!isProjectDir("/Users", home, "darwin"));
  assert.ok(!isProjectDir("", home, "linux"));

  const project = destination("/Users/someone/code/app", home, "darwin");
  assert.equal(project.dir, "/Users/someone/code/app/cuddler-out");
  assert.equal(project.show("a.mp4"), "cuddler-out/a.mp4");
  const fallback = destination("/", home, "darwin");
  assert.equal(fallback.dir, "/Users/someone/Downloads/Cuddler");
  assert.equal(fallback.show("a.mp4"), "~/Downloads/Cuddler/a.mp4");
});

// ── the whole hook ──────────────────────────────────────────────────────────

function hookInput(cwd, body, tool = "mcp__plugin_cuddler_cuddler__get_video") {
  return { hook_event_name: "PostToolUse", cwd, tool_name: tool, tool_input: { id: "vid_test01" }, tool_response: [{ type: "text", text: fence("get_video", body) }] };
}

function networkFor(video) {
  return fakeGet({
    [video.files[0].url]: { body: BYTES.mp4, type: "video/mp4" },
    [video.files[1].url]: { body: BYTES.jpg, type: "image/jpeg" },
  });
}

test("a ready video is saved once into cuddler-out/, with a .gitignore, and the note names no home path", async () => {
  const dirs = tempDirs();
  try {
    const video = readyVideo();
    const net = networkFor(video);
    const options = { env: {}, home: dirs.home, get: net.get, free: roomy };
    const text = await run(hookInput(dirs.project, { video }), options);
    const out = join(dirs.project, "cuddler-out");
    assert.deepEqual(readdirSync(out).sort(), [".gitignore", "20261019-1530-seedance-2.0-vid_test01-poster.jpg", "20261019-1530-seedance-2.0-vid_test01-watermarked.mp4"]);
    assert.equal(readFileSync(join(out, ".gitignore"), "utf8"), "*\n");
    assert.ok(readFileSync(join(out, "20261019-1530-seedance-2.0-vid_test01-watermarked.mp4")).equals(BYTES.mp4));
    assert.match(text, /saved the video, with the Cuddler\.ai mark, to cuddler-out\/20261019-1530-seedance-2\.0-vid_test01-watermarked\.mp4/);
    assert.match(text, /saved the poster to cuddler-out\/20261019-1530-seedance-2\.0-vid_test01-poster\.jpg/);
    assert.ok(!text.includes(dirs.home), "the note names no home path");
    assert.ok(!text.includes("https://"), "the note carries no link");
    assert.equal(net.calls.length, 2);

    // Polling again, or the download link for the same clip: nothing is fetched twice.
    const again = await run(hookInput(dirs.project, { video }), options);
    assert.match(again, /is already saved as cuddler-out\/20261019-1530-seedance-2\.0-vid_test01-watermarked\.mp4/);
    const link = await run(hookInput(dirs.project, { videoId: "vid_test01", files: video.files }, "mcp__cuddler__get_download_link"), options);
    assert.match(link, /already saved/);
    assert.equal(net.calls.length, 2);
    assert.equal(readdirSync(out).length, 3);
  } finally {
    dirs.done();
  }
});

test("nothing happens for a rendering video, another tool, a refused host, or with CUDDLER_SAVE_MEDIA=0", async () => {
  const dirs = tempDirs();
  try {
    const video = readyVideo();
    const net = networkFor(video);
    const options = { env: {}, home: dirs.home, get: net.get, free: roomy };
    assert.equal(await run(hookInput(dirs.project, { video: readyVideo({ status: "rendering", files: undefined }) }), options), null);
    assert.equal(await run(hookInput(dirs.project, { video }, "mcp__cuddler__create_video"), options), null);
    assert.equal(await run(hookInput(dirs.project, { video }, "mcp__other__get_video"), options), null);
    assert.equal(await run(hookInput(dirs.project, { video }), { ...options, env: { CUDDLER_SAVE_MEDIA: "0" } }), null);
    const elsewhere = readyVideo({ files: [{ kind: "video", url: "https://files.example.test/vid_test01.mp4", watermarked: true }] });
    assert.equal(await run(hookInput(dirs.project, { video: elsewhere }), options), null);
    assert.equal(net.calls.length, 0);
    assert.ok(!existsSync(join(dirs.project, "cuddler-out")), "no folder is made when there is nothing to save");
  } finally {
    dirs.done();
  }
});

test("a failed download says nothing and leaves nothing, so the skill downloads the file itself", async () => {
  const dirs = tempDirs();
  try {
    const video = readyVideo();
    const net = fakeGet({ [video.files[0].url]: { body: BYTES.html, type: "text/html" }, [video.files[1].url]: { status: 403 } });
    assert.equal(await run(hookInput(dirs.project, { video }), { env: {}, home: dirs.home, get: net.get, free: roomy }), null);
    assert.deepEqual(readdirSync(join(dirs.project, "cuddler-out")), [".gitignore"]);
  } finally {
    dirs.done();
  }
});

test("outside a project the file goes to ~/Downloads/Cuddler, without a .gitignore", async () => {
  const dirs = tempDirs();
  try {
    const image = { id: "img_a1", url: `${ASSET}/studio-images/img_a1.webp`, modelId: "nano-banana", createdAt: "2026-10-19T08:00:00Z" };
    const net = fakeGet({ [image.url]: { body: BYTES.webp, type: "image/webp" } });
    const text = await run(hookInput(dirs.home, { image }, "mcp__cuddler__create_image"), { env: {}, home: dirs.home, get: net.get, free: roomy });
    assert.equal(text, "Cuddler plugin: saved the image to ~/Downloads/Cuddler/20261019-0800-nano-banana-img_a1.webp (1 KB). Give the user this file instead of downloading again.");
    assert.deepEqual(readdirSync(join(dirs.home, "Downloads", "Cuddler")), ["20261019-0800-nano-banana-img_a1.webp"]);
  } finally {
    dirs.done();
  }
});

test("a project's cuddler-out/ that is a symbolic link is not written through; the file goes to ~/Downloads/Cuddler", async () => {
  if (process.platform === "win32") return;
  const dirs = tempDirs();
  try {
    const elsewhere = join(dirs.base, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(dirs.project, "cuddler-out"));
    const video = readyVideo();
    const text = await run(hookInput(dirs.project, { video }), { env: {}, home: dirs.home, get: networkFor(video).get, free: roomy });
    assert.deepEqual(readdirSync(elsewhere), [], "nothing is written where the link points");
    assert.match(text, /~\/Downloads\/Cuddler\/20261019-1530-seedance-2\.0-vid_test01-watermarked\.mp4/);
    assert.equal(readdirSync(join(dirs.home, "Downloads", "Cuddler")).length, 2);
  } finally {
    dirs.done();
  }
});

test("a Platform video's original and its watermarked download are two files, side by side", async () => {
  const dirs = tempDirs();
  try {
    const original = { object: "video", id: "vid_p1", status: "succeeded", model: "seedance-2.0-mini", created_at: "2026-10-19T01:02:00Z", output: { url: `${STORAGE}/cuddler-media-private/platform/vid_p1.mp4?X-Amz-Signature=a` } };
    const marked = { object: "video_download", id: "vid_p1", watermarked: true, url: `${STORAGE}/cuddler-media/platform/vid_p1-wm.mp4?X-Amz-Signature=b`, filename: "vid_p1.mp4" };
    const net = fakeGet({ [original.output.url]: { body: BYTES.mp4, type: "video/mp4" }, [marked.url]: { body: BYTES.mp4, type: "video/mp4" } });
    const options = { env: {}, home: dirs.home, get: net.get, free: roomy };
    const platformInput = (body, tool) => ({ cwd: dirs.project, tool_name: tool, tool_response: { content: [{ type: "text", text: JSON.stringify(body) }] } });
    assert.match(await run(platformInput(original, "mcp__cuddler-platform__get_video"), options), /cuddler-out\/20261019-0102-seedance-2\.0-mini-vid_p1\.mp4/);
    assert.match(await run(platformInput(marked, "mcp__cuddler-platform__download_video"), options), /cuddler-out\/20261019-0102-seedance-2\.0-mini-vid_p1-watermarked\.mp4/);
  } finally {
    dirs.done();
  }
});

test("a .part another run is still writing is left alone; a stale one is replaced", async () => {
  const dirs = tempDirs();
  try {
    const out = join(dirs.project, "cuddler-out");
    mkdirSync(out);
    const image = { kind: "image", id: "img_a1", url: `${ASSET}/i.png`, model: "nano-banana", createdAt: "2026-10-19T08:00:00Z" };
    const part = join(out, "20261019-0800-nano-banana-img_a1.part");
    writeFileSync(part, "busy");
    const net = fakeGet({ [image.url]: { body: BYTES.png, type: "image/png" } });
    const dest = destination(dirs.project, dirs.home);
    assert.equal(await saveOne(image, dest, { get: net.get, free: roomy }), null);
    assert.equal(readFileSync(part, "utf8"), "busy");
    const old = (Date.now() - LIMITS.stalePartMs - 60_000) / 1000;
    utimesSync(part, old, old);
    assert.deepEqual(await saveOne(image, dest, { get: net.get, free: roomy }), { status: "saved", name: "20261019-0800-nano-banana-img_a1.png", bytes: BYTES.png.length });
    assert.ok(!existsSync(part));
  } finally {
    dirs.done();
  }
});

test("CUDDLER_OPEN_AFTER_SAVE=1 opens the saved video, not the poster, with the system's default app", async () => {
  const dirs = tempDirs();
  try {
    const video = readyVideo();
    const opened = [];
    await run(hookInput(dirs.project, { video }), { env: { CUDDLER_OPEN_AFTER_SAVE: "1" }, home: dirs.home, get: networkFor(video).get, free: roomy, open: (file) => opened.push(file) });
    assert.deepEqual(opened, [join(dirs.project, "cuddler-out", "20261019-1530-seedance-2.0-vid_test01-watermarked.mp4")]);
    const quiet = [];
    await run(hookInput(dirs.project, { video }), { env: { CUDDLER_OPEN_AFTER_SAVE: "1" }, home: dirs.home, get: networkFor(video).get, free: roomy, open: (file) => quiet.push(file) });
    assert.deepEqual(quiet, [], "a file saved earlier isn't opened again");
    assert.deepEqual(openCommand("/a b.mp4", "darwin"), ["open", ["/a b.mp4"]]);
    assert.deepEqual(openCommand("C:\\a.mp4", "win32"), ["explorer.exe", ["C:\\a.mp4"]]);
    assert.deepEqual(openCommand("/a.mp4", "linux"), ["xdg-open", ["/a.mp4"]]);
  } finally {
    dirs.done();
  }
});

test("the note says what was saved and where", () => {
  const show = (name) => `cuddler-out/${name}`;
  assert.equal(
    note([{ target: { kind: "video", watermarked: false }, result: { status: "saved", name: "a.mp4", bytes: 12.5 * 1024 * 1024 } }], show),
    "Cuddler plugin: saved the video to cuddler-out/a.mp4 (12.5 MB). Give the user this file instead of downloading again.",
  );
});

test("proxies: HTTPS_PROXY is used for http:// proxies, NO_PROXY can skip it", () => {
  const url = new URL(`${ASSET}/a.mp4`);
  assert.equal(proxyFor(url, {}), null);
  assert.equal(proxyFor(url, { HTTPS_PROXY: "http://127.0.0.1:7890" })?.host, "127.0.0.1:7890");
  assert.equal(proxyFor(url, { https_proxy: "127.0.0.1:7890" })?.host, "127.0.0.1:7890");
  assert.equal(proxyFor(url, { ALL_PROXY: "http://proxy.internal:3128" })?.host, "proxy.internal:3128");
  assert.equal(proxyFor(url, { HTTPS_PROXY: "socks5://127.0.0.1:1080" }), null, "only CONNECT proxies; others go direct");
  for (const NO_PROXY of ["*", "asset.cuddler.ai", ".cuddler.ai", "cuddler.ai", "localhost, cuddler.ai:443", "*.cuddler.ai"]) {
    assert.equal(proxyFor(url, { HTTPS_PROXY: "http://127.0.0.1:7890", NO_PROXY }), null, NO_PROXY);
  }
  for (const NO_PROXY of ["localhost,127.0.0.1,::1,.local", "example.com", "ddler.ai"]) {
    assert.ok(proxyFor(url, { HTTPS_PROXY: "http://127.0.0.1:7890", NO_PROXY }), NO_PROXY);
  }
});

// ── the script as the host runs it ──────────────────────────────────────────

test("run as a hook, the script exits 0 and prints nothing when there is nothing to save or the input is bad", () => {
  const dirs = tempDirs();
  try {
    const inputs = [
      JSON.stringify(hookInput(dirs.project, { video: readyVideo({ status: "rendering", files: undefined }) })),
      JSON.stringify({ tool_name: "Bash", tool_response: { stdout: "" } }),
      "not json",
      "",
    ];
    for (const input of inputs) {
      const res = spawnSync(process.execPath, [SCRIPT], { input, encoding: "utf8", env: { ...process.env, HOME: dirs.home }, timeout: 20_000 });
      assert.equal(res.status, 0, res.stderr);
      assert.equal(res.stdout, "");
      assert.equal(res.stderr, "");
    }
    assert.ok(!existsSync(join(dirs.project, "cuddler-out")));
  } finally {
    dirs.done();
  }
});

test("the hook command exits 0 with no output when Node isn't there", () => {
  if (process.platform === "win32") return;
  const hooks = JSON.parse(readFileSync(join(ROOT, "hooks/hooks.json"), "utf8"));
  const command = hooks.hooks.PostToolUse[0].hooks[0].command.replaceAll("${CLAUDE_PLUGIN_ROOT}", ROOT);
  const res = spawnSync("/bin/sh", ["-c", command], { input: "{}", encoding: "utf8", env: { PATH: "/nonexistent" } });
  assert.equal(res.status, 0);
  assert.equal(res.stdout + res.stderr, "");
});
