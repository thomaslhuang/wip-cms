// Which site is open, and where its pieces are.
//
// WIP CMS edits one site folder at a time: any folder with a .pages.yml in it (the same
// settings file Pages CMS uses). The folder you open last is remembered in
// ~/.wip-cms.json, along with a short list of recent ones.
//
// Everything else asks this module for paths, so files can only ever be read or written
// inside the open site.
const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");

const PREFS = path.join(os.homedir(), ".wip-cms.json");
let current = null; // { root, mediaInput, mediaOutput, contentRoot }

// ---------- remembering sites ----------

function readPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS, "utf8")); } catch { return { recent: [] }; }
}
function writePrefs(p) {
  try { fs.writeFileSync(PREFS, JSON.stringify(p, null, 2)); } catch { /* not important */ }
}
const recentSites = () => (readPrefs().recent || []).filter((p) => fs.existsSync(path.join(p, ".pages.yml")));

// ---------- opening a site ----------

const expandHome = (p) => String(p || "").replace(/^~(?=$|\/)/, os.homedir());

function openSite(folder) {
  const root = path.resolve(expandHome(folder));
  if (!fs.existsSync(path.join(root, ".pages.yml"))) {
    throw Object.assign(new Error(`No .pages.yml in ${root}. Pick the site's main folder (the one with .pages.yml).`), { status: 400 });
  }
  const cfg = yaml.load(fs.readFileSync(path.join(root, ".pages.yml"), "utf8")) || {};
  const media = cfg.media || {};
  const mediaInput = (typeof media === "string" ? media : media.input) || "src/images";
  const mediaOutput = (typeof media === "object" && media.output) || "/" + path.basename(mediaInput);
  current = {
    root,
    mediaInput: mediaInput.replace(/^\/+|\/+$/g, ""),
    mediaOutput: "/" + String(mediaOutput).replace(/^\/+|\/+$/g, ""),
    // the folder the site generator builds pages from (src/ for Eleventy sites like this one):
    // src/blog/x/index.md is the page /blog/x/, and src/images/a.webp is /images/a.webp
    contentRoot: path.dirname(mediaInput.replace(/^\/+|\/+$/g, "")) || ".",
  };
  const prefs = readPrefs();
  prefs.last = root;
  prefs.recent = [root, ...(prefs.recent || []).filter((p) => p !== root)].slice(0, 8);
  writePrefs(prefs);
  return info();
}

function tryOpenLast(cliPath) {
  for (const candidate of [cliPath, process.env.WIP_SITE, readPrefs().last]) {
    if (!candidate) continue;
    try { return openSite(candidate); } catch (e) { if (candidate === cliPath) console.error("  " + e.message); }
  }
  return null;
}

function requireSite() {
  if (!current) throw Object.assign(new Error("No site is open yet."), { status: 409 });
  return current;
}

const info = () => current && { root: current.root, name: path.basename(current.root), mediaInput: current.mediaInput, mediaOutput: current.mediaOutput, contentRoot: current.contentRoot };

// ---------- paths inside the site ----------

// a path relative to the site folder; refuses anything that escapes it
function inSite(relative) {
  const { root } = requireSite();
  const full = path.resolve(root, String(relative || "").replace(/^\/+/, ""));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw Object.assign(new Error("Path is outside the site: " + relative), { status: 400 });
  }
  return full;
}
const rel = (full) => path.relative(requireSite().root, full).split(path.sep).join("/");

const imagesDir = () => inSite(requireSite().mediaInput);
const contentDir = () => inSite(requireSite().contentRoot);
const trashDir = () => inSite(".cms-trash");

// "/images/blog/x.webp" <-> <site>/src/images/blog/x.webp
function imageUrlToFile(url) {
  const { mediaOutput, mediaInput } = requireSite();
  const u = decodeURI(String(url));
  const tail = u.startsWith(mediaOutput + "/") ? u.slice(mediaOutput.length + 1) : u.replace(/^\/+/, "");
  return inSite(path.join(mediaInput, tail));
}
function fileToImageUrl(full) {
  return requireSite().mediaOutput + "/" + path.relative(imagesDir(), full).split(path.sep).join("/");
}

// the page address for a content file: src/blog/2026/10/x/index.md -> /blog/2026/10/x/
function urlFor(file) {
  const r = path.relative(contentDir(), path.dirname(file)).split(path.sep).join("/");
  return "/" + (r ? r + "/" : "");
}

// a post's own image folder: src/blog/2026/10/x -> src/images/blog/2026/10/x
const imageFolderFor = (entryFile) => path.join(imagesDir(), path.relative(contentDir(), path.dirname(inSite(entryFile))));

module.exports = {
  openSite, tryOpenLast, requireSite, info, recentSites,
  inSite, rel, imagesDir, contentDir, trashDir, imageUrlToFile, fileToImageUrl, urlFor, imageFolderFor,
};
