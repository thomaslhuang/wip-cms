// Which site is open, and where its pieces are.
//
// w·i·p cms edits one site folder at a time: any folder with a .pages.yml in it (the same
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
  // media: "src/images", { input, output }, or a list of named sources (Pages CMS allows all three)
  const trim = (p) => String(p || "").replace(/^\/+|\/+$/g, "");
  const sources = (Array.isArray(cfg.media) ? cfg.media : [typeof cfg.media === "string" ? { input: cfg.media } : cfg.media || {}])
    .filter(Boolean)
    .map((m, i) => {
      const input = trim(m.input || "src/images");
      return { name: m.name || (i ? "media" + i : "default"), input, output: "/" + trim(m.output ?? "/" + path.basename(input)) };
    });
  const media = sources[0];
  current = {
    root,
    mediaInput: media.input,
    mediaOutput: media.output,
    mediaSources: sources,
    // the folder the site generator builds pages from (src/ for Eleventy sites like this one):
    // src/blog/x/index.md is the page /blog/x/, and src/images/a.webp is /images/a.webp
    contentRoot: path.dirname(media.input) || ".",
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

const info = () => current && { root: current.root, name: path.basename(current.root), mediaInput: current.mediaInput, mediaOutput: current.mediaOutput, mediaSources: current.mediaSources, contentRoot: current.contentRoot };

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

// "/images/blog/x.webp" <-> <site>/src/images/blog/x.webp (with several media sources, the
// one whose address or folder matches)
function imageUrlToFile(url) {
  const { mediaSources } = requireSite();
  const u = decodeURI(String(url));
  const m = mediaSources.find((s) => u.startsWith(s.output + "/")) || mediaSources[0];
  const tail = u.startsWith(m.output + "/") ? u.slice(m.output.length + 1) : u.replace(/^\/+/, "");
  return inSite(path.join(m.input, tail));
}
function fileToImageUrl(full) {
  const { mediaSources } = requireSite();
  const r = rel(full);
  const m = mediaSources.find((s) => r.startsWith(s.input + "/")) || mediaSources[0];
  return m.output.replace(/\/$/, "") + "/" + path.relative(inSite(m.input), full).split(path.sep).join("/");
}
// is this file inside one of the media folders?
const inMedia = (full) => requireSite().mediaSources.some((s) => full.startsWith(inSite(s.input) + path.sep) || full === inSite(s.input));

// the page a Markdown file becomes (Eleventy's default): blog/x/index.md and blog/x.md are both /blog/x/
const pageDir = (file) => (path.basename(file) === "index.md" ? path.dirname(file) : file.replace(/\.md$/, ""));
function urlFor(file) {
  const r = path.relative(contentDir(), pageDir(file)).split(path.sep).join("/");
  return "/" + (r ? r + "/" : "");
}

// a post's own image folder: src/blog/2026/10/x -> src/images/blog/2026/10/x
const imageFolderFor = (entryFile) => path.join(imagesDir(), path.relative(contentDir(), pageDir(inSite(entryFile))));

module.exports = {
  openSite, tryOpenLast, requireSite, info, recentSites,
  inSite, rel, inMedia, imagesDir, contentDir, trashDir, imageUrlToFile, fileToImageUrl, urlFor, imageFolderFor,
};
