#!/usr/bin/env node
// wip cms
// -------
// A local editor for static sites that use a .pages.yml (the Pages CMS settings file).
//
//   npm start                          opens the site you used last
//   npm start -- ~/path/to/my-site     opens a particular site
//
// Then go to http://localhost:4321. Edits are saved straight into the site's files;
// publish however you normally do (e.g. commit and push in GitHub Desktop).
//
// This file is only the switchboard: each address below hands off to a module in lib/.
// The editor you see in the browser lives in public/. See README.md for a map.
const http = require("http");
const fs = require("fs");
const path = require("path");
const site = require("./lib/site");
const { loadConfig } = require("./lib/config");
const entries = require("./lib/entries");
const media = require("./lib/media");
const { allTags, syncTagSuggestions } = require("./lib/tags");
const preview = require("./lib/preview");
const phone = require("./lib/phone");
const setup = require("./lib/setup");

const PORT = Number(process.env.WIP_PORT) || 4321;
// Listens on the local network so your phone can reach the photo-upload page, but from
// any other device only that page works (see lib/phone.js). The editor is this computer only.
const HOST = "0.0.0.0";
const PUBLIC = path.join(__dirname, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".avif": "image/avif", ".woff2": "font/woff2",
};

// after anything changes a file, keep the preview and tag suggestions in step
function afterChange(file) {
  try { preview.syncFromSite(file); } catch { /* preview is optional */ }
  try { syncTagSuggestions(); } catch { /* sites without tags */ }
}

// ---------- the API: what the browser asks for ----------

const routes = {
  // which site is open, and recent ones (for the "Open site" screen)
  "GET /api/site": () => ({ site: site.info(), recent: site.recentSites() }),
  "POST /api/site": (q, body) => { const info = site.openSite(body.path); preview.startPreview(); return { site: info }; },
  // setting up a new site: look at a folder, then write its .pages.yml (lib/setup.js)
  "GET /api/site/inspect": (q) => setup.inspect(q.path),
  "POST /api/site/setup": (q, body) => { const { root } = setup.create(body.path, body.plan || {}); const info = site.openSite(root); preview.startPreview(); return { site: info }; },

  // everything the editor needs to draw itself
  "GET /api/config": () => ({ site: site.info(), ...loadConfig(), tags: allTags(), preview: preview.previewInfo() }),
  "GET /api/preview": () => preview.previewInfo(),

  // posts, projects, pages
  "GET /api/entries": (q) => entries.listEntries(q.section),
  "GET /api/entry": (q) => entries.readEntry(q.file),
  "PUT /api/entry": (q, body) => { const saved = entries.writeEntry(body.file, body.data, body.body); afterChange(saved.file); return saved; },
  "POST /api/entry": (q, body) => { const made = entries.createEntry(body.section, body.title); afterChange(made.file); return made; },
  "DELETE /api/entry": (q) => { const result = entries.deleteEntry(q.file); afterChange(q.file); return result; },

  // unsaved edits -> the live preview only (your files are untouched)
  "PUT /api/draft": (q, body) => ({ ok: preview.writeDraft(body.file, entries.serialize(body.file, body.data, body.body)) }),
  // forget unsaved edits: the preview goes back to what's saved
  "DELETE /api/draft": (q) => { preview.syncFromSite(q.file); return { ok: true }; },

  // how many files changed since the last commit (the "ready to publish" count)
  "GET /api/changes": () => changes(),

  // images
  "GET /api/image-folder": (q) => ({ folder: site.rel(site.imageFolderFor(q.file)) }),
  "GET /api/media": (q) => media.listFolder(q.folder),
  "GET /api/phone-link": (q) => phone.phoneLink(PORT, q.folder || site.rel(site.imagesDir())),
};

// git status of the open site; works without git too (count is then null)
function changes() {
  try {
    const out = require("child_process").execFileSync("git", ["status", "--porcelain"], { cwd: site.requireSite().root, encoding: "utf8", timeout: 5000 });
    const files = out.split("\n").filter((l) => l.trim() && !l.includes(".cms-trash/"));
    return { count: files.length };
  } catch { return { count: null }; }
}

// ---------- plumbing ----------

function send(res, status, payload, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(payload) : payload);
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Upload too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: "Not found" });
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = Object.fromEntries(url.searchParams);
  try {
    // ----- other devices (your phone): only the upload page and uploads -----
    if (!phone.isLocal(req)) {
      if (!phone.validToken(q.t)) return send(res, 403, { error: "This link has expired. Scan the QR code in wip cms again." });
      if (req.method === "GET" && url.pathname === "/phone") return serveFile(res, path.join(PUBLIC, "phone.html"));
      if (req.method === "POST" && url.pathname === "/api/upload") return send(res, 200, media.saveUpload(q.folder, q.name, await readBody(req)));
      return send(res, 403, { error: "Only photo uploads are allowed from other devices." });
    }
    if (req.method === "GET" && url.pathname === "/phone") return serveFile(res, path.join(PUBLIC, "phone.html"));
    if (req.method === "POST" && url.pathname === "/api/upload") return send(res, 200, media.saveUpload(q.folder, q.name, await readBody(req)));

    const route = routes[`${req.method} ${url.pathname}`];
    if (route) {
      const raw = ["PUT", "POST"].includes(req.method) ? await readBody(req, 5 * 1024 * 1024) : null;
      return send(res, 200, await route(q, raw && raw.length ? JSON.parse(raw) : {}));
    }
    // the open site's images, so thumbnails show (e.g. /images/blog/x.webp)
    const s = site.info();
    if (s && url.pathname.startsWith(s.mediaOutput + "/")) {
      return serveFile(res, site.imageUrlToFile(url.pathname));
    }
    // markdown -> HTML in the browser
    if (url.pathname === "/vendor/markdown-it.js") {
      return serveFile(res, path.join(__dirname, "node_modules", "markdown-it", "dist", "markdown-it.min.js"));
    }
    // the editor itself (public/...); any other address shows the app
    const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
    return serveFile(res, path.join(PUBLIC, "index.html"));
  } catch (err) {
    if (!err.status || err.status >= 500) console.error(err);
    return send(res, err.status || 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const cliPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const opened = site.tryOpenLast(cliPath);
  console.log(`\n  wip cms   →  http://localhost:${PORT}`);
  console.log(opened ? `  site      →  ${opened.root}` : "  site      →  none yet: pick one in the browser");
  if (opened && !process.argv.includes("--no-preview")) {
    preview.startPreview();
    console.log(`  preview   →  http://localhost:${preview.PREVIEW_PORT}`);
  }
  console.log("\n  Stop with Ctrl+C.\n");
});
