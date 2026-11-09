#!/usr/bin/env node
// w·i·p cms
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
const table = require("./lib/table");
const media = require("./lib/media");
const { allTags, syncTagSuggestions } = require("./lib/tags");
const preview = require("./lib/preview");
const phone = require("./lib/phone");
const setup = require("./lib/setup");
const sections = require("./lib/sections");
const trash = require("./lib/trash");
const remote = require("./lib/remote");
const changesLib = require("./lib/changes");
const search = require("./lib/search");
const audit = require("./lib/audit");
const history = require("./lib/history");

const PORT = Number(process.env.WIP_PORT) || 4321;
// the code's git commit when it started (the Mac app restarts the editor when this changes)
// the server's own code as it was when it started (its files' last-changed times). If you pull
// an update while it's running, the page sees the difference and restarts it (/api/restart),
// so the page and the server never run different versions.
const codeStamp = () => {
  const files = ["server.js", "package.json", ...fs.readdirSync(path.join(__dirname, "lib")).map((f) => "lib/" + f)];
  return String(Math.max(...files.map((f) => { try { return fs.statSync(path.join(__dirname, f)).mtimeMs; } catch { return 0; } })));
};
const STARTED_AS = codeStamp();
const VERSION = (() => { try { return require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname, encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
// Listens on the local network so your phone can reach the photo-upload page, but from
// any other device only that page works (see lib/phone.js). The editor is this computer only,
// unless you turn on Other devices in Settings: then a device that signs in with your password
// can use it too (lib/remote.js), minus the things in THIS_COMPUTER_ONLY below.
const HOST = "0.0.0.0";
const PUBLIC = path.join(__dirname, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".avif": "image/avif", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".pdf": "application/pdf",
};

// after anything changes a file, keep the preview and tag suggestions in step
function afterChange(file) {
  file = String(file).replace(/#\d+$/, "");   // a list item: the list's file
  try { preview.syncFromSite(file); } catch { /* preview is optional */ }
  try { syncTagSuggestions(); } catch { /* sites without tags */ }
}

// ---------- the API: what the browser asks for ----------

const routes = {
  // which site is open, and recent ones (for the "Open site" screen)
  "GET /api/site": (q, body, ctx) => ({ site: site.info(), recent: ctx.remote ? [] : site.recentWithNames(), remote: !!ctx.remote }),
  // your own name for a site, shown instead of its folder's name
  "POST /api/site/nickname": (q, body) => site.setNickname(body.path, body.nickname),
  "POST /api/site": (q, body) => { const info = site.openSite(body.path); preview.startPreview(); return { site: info }; },
  // setting up a new site: look at a folder, then write its .pages.yml (lib/setup.js)
  "GET /api/site/inspect": (q) => setup.inspect(q.path),
  "POST /api/site/setup": (q, body) => { const { root } = setup.create(body.path, body.plan || {}); const info = site.openSite(root); preview.startPreview(); return { site: info }; },

  // adding a collection or page to the open site (the sidebar's +; lib/sections.js)
  "GET /api/sections/options": () => sections.options(),
  "POST /api/sections": (q, body) => { const made = sections.add(body.plan || {}); afterChange(".pages.yml"); afterChange(made.path); return made; },

  // everything the editor needs to draw itself
  "GET /api/config": (q, body, ctx) => ({ site: site.info(), ...loadConfig(), tags: allTags(), preview: preview.previewInfo(), remote: !!ctx.remote }),
  "GET /api/preview": () => preview.previewInfo(),

  // posts, projects, pages
  "GET /api/entries": (q) => entries.listEntries(q.section),
  "GET /api/entry": (q) => entries.readEntry(q.file),
  "PUT /api/entry": (q, body) => { const saved = entries.writeEntry(body.file, body.data, body.body, body.version); afterChange(saved.file); return saved; },
  // the spreadsheet view (Settings → Advanced tools; lib/table.js)
  "GET /api/table": (q) => table.rows(q.section, entries),
  "PUT /api/table": (q, body) => { const r = table.save(body.section, body.edits || []); Object.keys(r.versions).forEach(afterChange); return r; },
  "POST /api/table": (q, body) => { const r = table.add(body.section, body.rows || [], entries); (r.files || [entries.listFileOf(body.section)]).forEach(afterChange); return r; },
  // lists kept in one data file: drag an item to a new place
  "POST /api/move": (q, body) => { const r = entries.moveEntry(body.section, body.from, body.to); afterChange(entries.listFileOf(body.section)); return r; },
  "POST /api/entry": (q, body) => { const made = entries.createEntry(body.section, body.title, body.slug, body.extra); afterChange(made.file); return made; },
  "DELETE /api/entry": (q) => { const result = entries.deleteEntry(q.file); afterChange(q.file); return result; },
  // several at once (the list's Select mode)
  "POST /api/entries/trash": (q, body) => { const files = body.files || []; const r = entries.deleteEntries(files); new Set(files).forEach(afterChange); return r; },

  // unsaved edits -> the live preview only (your files are untouched)
  "PUT /api/draft": (q, body) => ({ ok: preview.writeDraft(String(body.file).replace(/#\d+$/, ""), entries.serialize(body.file, body.data, body.body)) }),
  // forget unsaved edits: the preview goes back to what's saved
  "DELETE /api/draft": (q) => { preview.syncFromSite(String(q.file).replace(/#\d+$/, "")); return { ok: true }; },

  // Settings → Other devices: use this site from your phone (lib/remote.js). This computer only.
  "GET /api/remote": () => remote.status(PORT),
  "POST /api/remote": async (q, body) => { await remote.configure(body); return remote.status(PORT); },
  "POST /api/remote/signout": () => { remote.signOutAll(); return { ok: true }; },
  // an https address for the phone, through Tailscale (lib/remote.js)
  "POST /api/remote/https": async (q, body) => { await remote.setHttps(!!body.on, PORT); return remote.status(PORT); },

  // which post or page makes this web address (the preview says which page it's on)
  "GET /api/find": (q) => entries.findByUrl(q.url),

  // the Trash (.cms-trash in the site): what's in it, and putting things back (lib/trash.js)
  "GET /api/trash": () => trash.list(),
  "POST /api/trash/restore": (q, body) => { const r = trash.restore(body.id); afterChange(r.file || r.restored); return r; },
  "POST /api/trash/reveal": () => trash.reveal(),

  // how many files changed since the last commit (the "ready to publish" count), and how
  // many things are in the Trash
  "GET /api/changes": () => ({ ...changesLib.status(), trash: trash.count() }),
  // show one of the changed files in the Finder (this computer only)
  "POST /api/changes/reveal": (q, body) => changesLib.reveal(String(body.path || "")),

  // searching every section at once; and checks on the pictures (unused, no alt text)
  "GET /api/search": (q) => search.run(q.q, entries),
  "GET /api/audit": () => audit.run(),

  // earlier versions of a post (from git, read-only), what putting one back would change, and putting it back
  "GET /api/history": (q) => history.list(q.file),
  "GET /api/history/diff": (q) => history.diff(q.file, q.commit),
  "POST /api/history/restore": (q, body) => { const r = history.restore(body.file, body.commit, body.version, entries); afterChange(r.file); return r; },

  // stop w·i·p cms (the ⋯ menu's Quit, and the Mac app when it needs to restart a newer version)
  "POST /api/quit": () => { setTimeout(() => { try { preview.stopPreview(); } catch { /* fine */ } process.exit(0); }, 150); return { ok: true }; },
  // which version is running, so the Mac app can tell when it needs restarting after an update
  "GET /api/version": () => ({ version: VERSION, stale: codeStamp() !== STARTED_AS }),
  // start again with the code that's on disk now (after an update): a fresh copy of this
  // process takes over the same address, writing to the same log
  "POST /api/restart": () => {
    setTimeout(() => {
      try { preview.stopPreview(); } catch { /* fine */ }
      server.close();
      const child = require("child_process").spawn(process.execPath, process.argv.slice(1), { cwd: process.cwd(), env: process.env, detached: true, stdio: ["ignore", "inherit", "inherit"] });
      child.unref();
      process.exit(0);
    }, 150);
    return { ok: true };
  },

  // images
  // where a post's uploads go (a list item's image fields usually say for themselves; see entries.js)
  "GET /api/image-folder": (q) => ({ folder: /#\d+$/.test(q.file)
    ? site.requireSite().mediaInput + "/" + require("path").basename(q.file.replace(/#\d+$/, "")).replace(/\.\w+$/, "")
    : site.rel(site.imageFolderFor(q.file)) }),
  "GET /api/media": (q) => media.listFolder(q.folder),
  // a picture from elsewhere in the library, copied into a field's own folder
  "POST /api/media/copy": (q, body) => media.copyInto(body.url, body.folder),
  // the Media page's "Move to Trash": first which are still used, then the move itself
  "POST /api/media/usage": (q, body) => media.usage(body.urls || []),
  "POST /api/media/trash": (q, body) => media.trash(body.urls || []),
  "GET /api/phone-link": (q) => phone.phoneLink(PORT, q.folder || site.rel(site.imagesDir()), q.edge),
};

// What a device that signed in (Other devices) can't do: only this computer can quit, switch
// to another folder on this Mac, set things up in one, show things in the Finder, or change who
// may connect.
const THIS_COMPUTER_ONLY = new Set([
  "POST /api/quit", "POST /api/site", "POST /api/site/setup", "GET /api/site/inspect", "POST /api/site/nickname",
  "POST /api/trash/reveal", "GET /api/phone-link",
  "GET /api/remote", "POST /api/remote", "POST /api/remote/signout", "POST /api/remote/https", "POST /api/changes/reveal",
]);

// the few things that are fine to show before signing in: the sign-in page's own picture
const BEFORE_SIGN_IN = new Set(["/favicon.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"]);

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
  try {
    const url = new URL(req.url, "http://localhost");
    const q = Object.fromEntries(url.searchParams);

    // a page on some other web address can't make your browser change things here
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin) {
      let same = false;
      try { same = new URL(req.headers.origin).host === req.headers.host; } catch { /* "null" and the like */ }
      if (!same) return send(res, 403, { error: "That request came from another web page, so it was refused." });
    }

    // ----- other devices (your phone) -----
    const local = phone.isLocal(req);
    if (!local) {
      // the photo-upload page, by its secret link (From phone in the picker)
      if (phone.validToken(q.t)) {
        if (req.method === "GET" && url.pathname === "/phone") return serveFile(res, path.join(PUBLIC, "phone.html"));
        if (req.method === "POST" && url.pathname === "/api/upload") return send(res, 200, media.saveUpload(q.folder, q.name, await readBody(req)));
      }
      if (!remote.enabled()) {
        if (url.pathname === "/phone") return send(res, 403, { error: "This link has expired. Scan the QR code in w·i·p cms again." });
        return send(res, 403, { error: "Only photo uploads are allowed from other devices." });
      }
      // Other devices is on: sign in with the password, then it's the editor
      if (req.method === "POST" && url.pathname === "/api/login") {
        const raw = await readBody(req, 4096);
        let password;
        try { password = JSON.parse(raw.toString() || "{}").password; } catch { /* no password */ }
        try { await remote.login(req, password); }
        catch (err) { if (err.retryAfter) res.setHeader("Retry-After", err.retryAfter); throw err; }
        res.setHeader("Set-Cookie", remote.sessionCookie(req));
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/logout") { res.setHeader("Set-Cookie", remote.clearCookie(req)); return send(res, 200, { ok: true }); }
      const left = remote.sessionLeft(req);
      if (!left) {
        if (req.method === "GET" && BEFORE_SIGN_IN.has(url.pathname)) return serveFile(res, path.join(PUBLIC, url.pathname));
        if (url.pathname.startsWith("/api/")) return send(res, 401, { error: "Sign in first." });
        return serveFile(res, path.join(PUBLIC, "login.html"));
      }
      // signed in: stay signed in while you keep using it
      if (left < remote.SESSION_MS / 2) res.setHeader("Set-Cookie", remote.sessionCookie(req));
    }
    const key = `${req.method} ${url.pathname}`;
    if (!local && THIS_COMPUTER_ONLY.has(key)) return send(res, 403, { error: "That only works on the Mac that w·i·p cms is running on." });

    if (req.method === "GET" && url.pathname === "/phone") return serveFile(res, path.join(PUBLIC, "phone.html"));
    // the picture to crop from (its uncropped original, if it's been cropped before)
    if (req.method === "GET" && url.pathname === "/api/media/original") return serveFile(res, media.cropSource(q.url));
    // a picture in the Trash, for its thumbnail on the Trash page
    if (req.method === "GET" && url.pathname === "/api/trash/file") return serveFile(res, trash.inTrash(q.id));
    // a new version of a picture, under the same name (public/js/media.js replaceImage)
    if (req.method === "POST" && url.pathname === "/api/media/replace") {
      const r = media.replaceFile(q.url, await readBody(req, media.MAX_FILE + 1024), { crop: q.crop === "1" });
      try { preview.syncFromSite(site.rel(site.imageUrlToFile(decodeURI(q.url)))); } catch { /* preview is optional */ }
      return send(res, 200, r);
    }
    if (req.method === "POST" && url.pathname === "/api/upload") {
      const anyFile = q.kind === "file";
      return send(res, 200, media.saveUpload(q.folder, q.name, await readBody(req, anyFile ? media.MAX_FILE + 1024 : undefined), anyFile));
    }

    const route = routes[key];
    if (route) {
      const raw = ["PUT", "POST"].includes(req.method) ? await readBody(req, 5 * 1024 * 1024) : null;
      return send(res, 200, await route(q, raw && raw.length ? JSON.parse(raw) : {}, { remote: !local }));
    }
    // the open site's images, so thumbnails show (e.g. /images/blog/x.webp)
    const s = site.info();
    if (s && s.mediaSources.some((m) => url.pathname.startsWith(m.output.replace(/\/$/, "") + "/"))) {
      return serveFile(res, site.imageUrlToFile(url.pathname));
    }
    // markdown -> HTML in the browser
    if (url.pathname === "/vendor/markdown-it.js") {
      return serveFile(res, path.join(__dirname, "node_modules", "markdown-it", "dist", "markdown-it.min.js"));
    }
    // the editor itself (public/...); any other address shows the app
    const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
    if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
    return serveFile(res, path.join(PUBLIC, "index.html"));
  } catch (err) {
    if (!err.status || err.status >= 500) console.error(err);
    return send(res, err.status || 500, { error: err.message });
  }
});

// right after a restart the old copy may still hold the address for a moment: try again
let listenTries = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && listenTries++ < 40) { setTimeout(() => server.listen(PORT, HOST), 250); return; }
  console.error(err.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  const cliPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const opened = site.tryOpenLast(cliPath);
  console.log(`\n  w·i·p cms   →  http://localhost:${PORT}`);
  console.log(opened ? `  site      →  ${opened.root}` : "  site      →  none yet: pick one in the browser");
  if (opened && !process.argv.includes("--no-preview")) {
    preview.startPreview();
    console.log(`  preview   →  http://localhost:${preview.PREVIEW_PORT}`);
  }
  console.log("\n  Stop with Ctrl+C.\n");
});
