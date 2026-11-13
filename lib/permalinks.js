// The page address of an item in a list file, e.g. /projects/blurring-boundaries/.
//
// Eleventy sites make one page per item with a template like src/projects/projects.njk:
//
//   ---
//   pagination:
//     data: projects
//     size: 1
//     alias: project
//   permalink: "/projects/{{ project.slug }}/"
//   ---
//
// w·i·p cms finds that template and fills in the item. A section in .pages.yml can also say
// it outright: url: "/projects/{slug}/". A list with no page per item (a list of stockists,
// say) is shown on one page, like src/stockist/index.njk with permalink "/stockist/" and a loop
// over the list: every item's address is that page. If it can't be told which page that is,
// the item has no address.
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const site = require("./site");

const TEMPLATE = /\.(njk|liquid|md|html|webc|hbs|mustache|ejs|haml|pug)$/i;
const SKIP = new Set(["node_modules", "_site", ".git", ".cms-trash"]);

// "src/_data/projects.json" -> "projects"; "src/_data/shop/items.json" -> "shop.items"
function dataKey(file) {
  const dataDir = path.posix.join(site.requireSite().contentRoot === "." ? "" : site.requireSite().contentRoot, "_data");
  const r = path.posix.relative(dataDir, file);
  if (r.startsWith("..")) return null;
  return r.replace(/\.(json|ya?ml)$/i, "").split("/").join(".");
}

let cache = { key: null, at: 0, found: {}, pages: [] };
function findTemplates() {
  const root = site.contentDir();
  const key = root;
  if (cache.key === key && Date.now() - cache.at < 5000) return cache;
  const found = {}, pages = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { if (full !== site.imagesDir()) walk(full); continue; }
      if (!TEMPLATE.test(name) || st.size > 400000) continue;
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(full, "utf8"));
      if (!m) continue;
      let front;
      try { front = yaml.load(m[1], { schema: yaml.CORE_SCHEMA }); } catch { continue; }
      const p = front && front.pagination;
      // one page for the whole list: a fixed address, whose template goes through the list
      if (!p && front && typeof front.permalink === "string" && !/\{[{%]/.test(front.permalink)) {
        pages.push({ permalink: front.permalink, body: fs.readFileSync(full, "utf8").slice(m[0].length) });
        continue;
      }
      if (!p || typeof p.data !== "string" || typeof front.permalink !== "string" || Number(p.size || 1) !== 1) continue;
      found[p.data] = { alias: p.alias || "pagination.items[0]", permalink: front.permalink };
    }
  };
  try { walk(root); } catch { /* unreadable folder: no addresses */ }
  cache = { key, at: Date.now(), found, pages };
  return cache;
}

const slugify = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// a function item -> its address (or null), for one section
function urlMaker(section) {
  if (section.url) return (item) => fill(section.url, (name) => item?.[name]);
  const key = dataKey(section.path);
  const { found, pages } = key ? findTemplates() : { found: {}, pages: [] };
  const tpl = key && found[key];
  if (!tpl) {
    // the list's one page: the template that loops over it ("{% for store in stockists %}"), or else the
    // only one that mentions it
    const name = (key || "").split(".").pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!name) return () => null;
    const loops = pages.filter((x) => new RegExp(`\\bin\\s+${name}\\b`).test(x.body));
    const mentions = pages.filter((x) => new RegExp(`\\b${name}\\b`).test(x.body));
    const page = loops.length === 1 ? loops[0] : mentions.length === 1 ? mentions[0] : null;
    if (!page) return () => null;
    const url = page.permalink.startsWith("/") ? page.permalink.replace(/index\.html$/, "") : "/" + page.permalink;
    return (item) => (item ? url : null);
  }
  const alias = tpl.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // {{ project.slug }}, {{ project.slug | slugify }}, {{ project.title | slug }}
  const re = new RegExp(`\\{\\{-?\\s*${alias}\\.([\\w]+)\\s*((?:\\|\\s*\\w+\\s*)*)-?\\}\\}`, "g");
  return (item) => {
    if (!item) return null;
    let missing = false;
    const out = tpl.permalink.replace(re, (m, field, filters) => {
      let v = item[field];
      if (v == null || v === "") missing = true;
      v = String(v ?? "");
      if (/\b(slugify|slug)\b/.test(filters)) v = slugify(v);
      return v;
    });
    if (missing || /\{\{|\{%/.test(out)) return null;   // something we couldn't work out
    return out.startsWith("/") ? out.replace(/index\.html$/, "") : "/" + out;
  };
}

// "/projects/{slug}/" with an item's values; null when a value is missing
function fill(template, get) {
  let missing = false;
  const out = String(template).replace(/\{(\w+)\}/g, (m, name) => {
    const v = get(name);
    if (v == null || v === "") { missing = true; return ""; }
    return String(v);
  });
  return missing ? null : out;
}

module.exports = { urlMaker, fill, dataKey };
