// The live preview: your real site, showing your edits as you type, before you save.
//
// How: w·i·p cms keeps a "shadow" copy of the open site in a temporary folder and runs the
// site's own Eleventy on it (http://localhost:8080). While you edit, your unsaved changes
// are written into the shadow copy only; Eleventy rebuilds the page and the Preview panel
// updates in place. Your real files only change when you press Save.
//
// What's shared instead of copied: node_modules and the image library are linked, not
// copied, so the shadow copy is small and new uploads show up straight away.
//
// The preview you see (http://localhost:8080) is a small go-between in front of Eleventy (which
// really runs at 9080). It passes everything through unchanged, except that each page gets a
// one-line script that tells w·i·p cms which page it's on, so clicking through the preview
// opens the matching post in the editor. (The editor can't look inside the preview by itself:
// they're different addresses, so the browser keeps them apart.)
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const site = require("./site");
const remote = require("./remote");

const PREVIEW_PORT = Number(process.env.WIP_PREVIEW_PORT) || 8080;
const ELEVENTY_PORT = PREVIEW_PORT + 1000;
const SKIP = new Set([".git", "node_modules", "_site", ".cms-trash", ".DS_Store"]);

let child = null;
let shadow = null;      // path of the shadow copy
let shadowOf = null;    // which site it's a copy of
let status = "off";     // off | starting | ready | unavailable
let port = null;        // where Eleventy really is: it moves to the next port if 9080 is taken
let restarts = 0;       // automatic restarts after the preview stopped by itself
let message = "";
let watcher = null;     // mirrors changes made outside w·i·p cms (e.g. editing a template in VS Code)

function eleventyBin(root) {
  const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "eleventy.cmd" : "eleventy");
  return fs.existsSync(bin) ? bin : null;
}

// The site's own Eleventy settings file, when it isn't one Eleventy finds by itself
// (eleventy.config.js, .eleventy.js...): the --config=... in package.json's scripts, the way
// the site itself runs ("start": "eleventy --serve --config=config.js").
function configArgs(root) {
  try {
    const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts || {};
    for (const name of ["start", "serve", "dev", "watch", "build"]) {
      const m = /eleventy\b[^&|;]*?--config[= ]\s*["']?([^\s"']+)/.exec(scripts[name] || "");
      if (m && fs.existsSync(path.join(root, m[1]))) return [`--config=${m[1]}`];
    }
  } catch { /* no package.json */ }
  return [];
}

// copy the site into the shadow folder (links for node_modules and images)
function buildShadow(root) {
  const dir = path.join(os.tmpdir(), "wip-cms-preview", crypto.createHash("sha1").update(root).digest("hex").slice(0, 10));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const images = site.imagesDir();
  const copy = (from, to) => {
    for (const name of fs.readdirSync(from)) {
      if (SKIP.has(name)) continue;
      const src = path.join(from, name), dst = path.join(to, name);
      if (src === images) { fs.symlinkSync(src, dst, "dir"); continue; }
      const st = fs.lstatSync(src);
      if (st.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), dst);
      else if (st.isDirectory()) { fs.mkdirSync(dst); copy(src, dst); }
      else fs.copyFileSync(src, dst);
    }
  };
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}

// Eleventy's own server answers everyone on the network unless told otherwise, so it's started
// with lib/bind-loopback.js, which makes it answer only this computer. (Copied to the temp
// folder first: NODE_OPTIONS can't cope with a folder name that has spaces in it.)
function eleventyEnv() {
  const env = { ...process.env };
  try {
    const dir = path.join(os.tmpdir(), "wip-cms-preview");
    fs.mkdirSync(dir, { recursive: true });
    const preload = path.join(dir, "bind-loopback.js");
    fs.copyFileSync(path.join(__dirname, "bind-loopback.js"), preload);
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --require=${preload}`.trim();
  } catch { /* the preview still works; it's just open to the network, as before */ }
  return env;
}

function stopPreview() {
  if (child) { const c = child; child = null; c.kill(); }
  if (watcher) { watcher.close(); watcher = null; }
  status = "off";
}

function startPreview() {
  stopPreview();
  const { root } = site.requireSite();
  const bin = eleventyBin(root);
  if (!bin) {
    status = "unavailable";
    message = "Live preview works with Eleventy sites: run `npm install` in the site folder first.";
    return;
  }
  // Eleventy 3 (most sites now) needs Node 18 or newer; an older one makes it quit at once
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    status = "unavailable";
    message = `The live preview needs Node.js 18 or newer, and w·i·p cms is running on Node ${process.version}. Install the LTS version from nodejs.org, then quit and reopen w·i·p cms.`;
    return;
  }
  shadow = buildShadow(root);
  shadowOf = root;
  status = "starting";
  message = "";
  port = null;
  startProxy();
  child = spawn(bin, ["--serve", "--quiet", `--port=${ELEVENTY_PORT}`, ...configArgs(root)], { cwd: shadow, env: eleventyEnv(), stdio: ["ignore", "pipe", "pipe"] });
  // the last lines Eleventy wrote: if it stops, these say why
  let tail = [];
  const watch = (d) => {
    const text = String(d);
    tail = tail.concat(text.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean)).slice(-40);
    const at = /localhost:(\d+)/i.exec(text);
    if (at) port = Number(at[1]);
    if (/Server at|Serving|localhost:\d+/i.test(text)) { status = "ready"; restarts = 0; }
    if (/error/i.test(text)) { message = text.trim().split("\n").slice(-3).join(" "); process.stderr.write("[preview] " + text); }
  };
  child.stdout.on("data", watch);
  child.stderr.on("data", watch);
  // changes made outside w·i·p cms (templates, CSS, a git pull) reach the preview too
  try {
    const images = site.rel(site.imagesDir());
    watcher = fs.watch(root, { recursive: true }, (event, name) => {
      if (!name) return;
      const rel = name.split(path.sep).join("/");
      if (rel.split("/").some((part) => SKIP.has(part)) || rel.startsWith(images + "/")) return;
      try { syncFromSite(rel); } catch { /* gone again, or a folder */ }
    });
  } catch { /* recursive watching unsupported: restart w·i·p cms to pick up template changes */ }
  const mine = child;
  child.on("exit", (code) => {
    if (child !== mine) return;          // stopped on purpose (a restart, or another site)
    child = null; status = "off";
    // Eleventy's own explanation (its "[11ty] Problem writing…" lines and the error under them),
    // not just "code 1", which only means "it hit an error and quit"
    if (code) {
      const why = tail.filter((l) => /\[11ty\]|Error|error|problem|cannot|not found|unexpected/i.test(l) && !/^at /.test(l)).map((l) => l.replace(/^\[11ty\]\s*/, "")).slice(0, 4);
      message = `The preview stopped: Eleventy hit an error building your site.${why.length ? " " + why.join(" · ") : ""} (Node ${process.version})`;
      process.stderr.write("[preview] stopped with code " + code + ":\n  " + tail.slice(-20).join("\n  ") + "\n");
    }
    // it stopped by itself: try again a few times (e.g. its port was still busy after a restart)
    if (restarts++ < 3) setTimeout(() => { if (!child && shadowOf === site.requireSite().root) startPreview(); }, 2000);
  });
}

// write unsaved content into the shadow copy (never into your real files)
function writeDraft(file, text) {
  if (!shadow || shadowOf !== site.requireSite().root) return false;
  const rel = site.rel(site.inSite(file));
  const target = path.join(shadow, rel);
  if (!target.startsWith(shadow + path.sep)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, "utf8");
  return true;
}

// keep the shadow copy in step after a real save / create / delete
function syncFromSite(file) {
  if (!shadow || shadowOf !== site.requireSite().root) return;
  const real = site.inSite(file);
  const target = path.join(shadow, site.rel(real));
  if (fs.existsSync(real) && fs.statSync(real).isDirectory()) return;
  if (fs.existsSync(real)) {
    // unchanged? leave it, so the preview doesn't rebuild for nothing
    if (fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(real))) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(real, target);
  }
  // deleted: posts live in their own folder (…/my-post/index.md), so remove that folder
  else if (path.basename(real) === "index.md" && !fs.existsSync(path.dirname(real))) fs.rmSync(path.dirname(target), { recursive: true, force: true });
  else fs.rmSync(target, { force: true });
}

// ---------- the go-between (see the top of this file) ----------

const http = require("http");
const net = require("net");
// tells the editor (the window this preview is inside) which page this is
const TELL = `<script>(function(){if(window.parent===window)return;function s(){try{parent.postMessage({wipPreview:"nav",path:location.pathname},"*")}catch(e){}}s();addEventListener("pageshow",s);})();</script>`;
let proxy = null;
let proxyPort = null;
function startProxy() {
  if (proxy) return;
  proxy = http.createServer((req, res) => {
    // other devices only once they've signed in (lib/remote.js)
    if (!remote.allowed(req)) { res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Sign in to w·i·p cms first."); }
    if (!port) { res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("The preview is starting…"); }
    const upstream = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: { ...req.headers, "accept-encoding": "identity" } }, (up) => {
      const html = /text\/html/i.test(up.headers["content-type"] || "") && !up.headers["content-encoding"];
      if (!html) { res.writeHead(up.statusCode, up.headers); return up.pipe(res); }
      const chunks = [];
      up.on("data", (c) => chunks.push(c));
      up.on("end", () => {
        let text = Buffer.concat(chunks).toString("utf8");
        text = /<\/body>/i.test(text) ? text.replace(/<\/body>(?![\s\S]*<\/body>)/i, TELL + "</body>") : text + TELL;
        const headers = { ...up.headers };
        delete headers["content-length"];
        delete headers["transfer-encoding"];
        res.writeHead(up.statusCode, headers);
        res.end(text);
      });
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }); res.end("The preview isn't answering."); });
    req.pipe(upstream);
  });
  // Eleventy's live reload talks over a WebSocket: pass it straight through
  proxy.on("upgrade", (req, socket, head) => {
    if (!port || !remote.allowed(req)) return socket.destroy();
    const up = net.connect(port, "127.0.0.1", () => {
      up.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
      if (head?.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
  });
  // 8080 taken (another preview, say): the next free one
  let tryPort = PREVIEW_PORT;
  proxy.on("error", (err) => { if (err.code === "EADDRINUSE" && tryPort < PREVIEW_PORT + 20) proxy.listen(++tryPort); });
  proxy.on("listening", () => { proxyPort = proxy.address().port; });
  proxy.listen(tryPort);
}

const previewInfo = () => ({ port: proxyPort || PREVIEW_PORT, status: status === "ready" && !proxyPort ? "starting" : status, message });

for (const sig of ["exit", "SIGINT", "SIGTERM"]) {
  process.on(sig, () => { if (child) child.kill(); if (sig !== "exit") process.exit(0); });
}

module.exports = { startPreview, stopPreview, writeDraft, syncFromSite, previewInfo, PREVIEW_PORT };
