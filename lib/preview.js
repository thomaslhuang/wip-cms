// The live preview: your real site, showing your edits as you type, before you save.
//
// How: w·i·p cms keeps a "shadow" copy of the open site in a temporary folder and runs the
// site's own Eleventy on it (http://localhost:8080). While you edit, your unsaved changes
// are written into the shadow copy only; Eleventy rebuilds the page and the Preview panel
// updates in place. Your real files only change when you press Save.
//
// What's shared instead of copied: node_modules and the image library are linked, not
// copied, so the shadow copy is small and new uploads show up straight away.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const site = require("./site");

const PREVIEW_PORT = Number(process.env.WIP_PREVIEW_PORT) || 8080;
const SKIP = new Set([".git", "node_modules", "_site", ".cms-trash", ".DS_Store"]);

let child = null;
let shadow = null;      // path of the shadow copy
let shadowOf = null;    // which site it's a copy of
let status = "off";     // off | starting | ready | unavailable
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

function stopPreview() {
  if (child) { child.kill(); child = null; }
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
  shadow = buildShadow(root);
  shadowOf = root;
  status = "starting";
  message = "";
  child = spawn(bin, ["--serve", "--quiet", `--port=${PREVIEW_PORT}`, ...configArgs(root)], { cwd: shadow, stdio: ["ignore", "pipe", "pipe"] });
  const watch = (d) => {
    const text = String(d);
    if (/Server at|Serving|localhost:\d+/i.test(text)) status = "ready";
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
  child.on("exit", (code) => { if (child) { child = null; status = "off"; if (code) message = `Preview stopped (code ${code}).`; } });
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

const previewInfo = () => ({ port: PREVIEW_PORT, status, message });

for (const sig of ["exit", "SIGINT", "SIGTERM"]) {
  process.on(sig, () => { if (child) child.kill(); if (sig !== "exit") process.exit(0); });
}

module.exports = { startPreview, stopPreview, writeDraft, syncFromSite, previewInfo, PREVIEW_PORT };
