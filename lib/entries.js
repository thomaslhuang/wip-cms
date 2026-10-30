// Listing, opening, saving, creating and deleting content.
//
//   collections (blog posts, projects): one Markdown file per entry, either in its own
//     folder (src/blog/2026/10/on-mexico-city/index.md) or not (src/blog/on-mexico-city.md)
//   lists (projects.json on some sites): one data file whose items are the entries; see listfile.js
//   files (home, about, site settings...): one file each, e.g. src/_data/home.json
const fs = require("fs");
const path = require("path");
const site = require("./site");
const { inSite, rel, urlFor, imageFolderFor } = site;
const { parseMarkdown, stringifyMarkdown, clean } = require("./frontmatter");
const { findSection, loadConfig } = require("./config");
const listfile = require("./listfile");
const { urlMaker, fill } = require("./permalinks");

// ---------- listing ----------

// A section's entries are its Markdown files. Two layouts are understood:
//   folders:  blog/my-post/index.md     (a filename template ending in /index.md, like studiotomby.com)
//   files:    blog/my-post.md           (any other template, e.g. "{primary}.md": Eleventy's default)
// With no template, both are listed. The section's own index.md (its listing page) never is.
const folderStyle = (section) => !section.filename || /(^|\/)index\.md$/.test(section.filename);
const flatStyle = (section) => !section.filename || !/(^|\/)index\.md$/.test(section.filename);
function findEntryFiles(section) {
  const root = inSite(section.path);
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".") || name.startsWith("_") || name === "node_modules") continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith(".md") || /^readme\.md$/i.test(name)) continue;
      if (name === "index.md" ? dir !== root && folderStyle(section) : flatStyle(section)) out.push(full);
    }
  };
  walk(root);
  return out;
}


function listEntries(sectionName) {
  const section = findSection(sectionName);
  if (section.store === "list") return listfile.listEntries(section, { pageUrl: urlMaker(section), imageUrl, excerptOf });
  const files = findEntryFiles(section);
  // which fields to show in the list, whatever the site calls them:
  //   the picture: featuredImage, or else the first single-image field
  //   the date: a field called date, or else the first date field
  //   groups: every single-choice (select) field, so the list can be grouped by it
  const picField = section.fields.find((f) => f.name === "featuredImage") || section.fields.find((f) => f.type === "image" && !f.options?.multiple);
  const dateField = section.fields.find((f) => f.name === "date") || section.fields.find((f) => f.type === "date");
  const choiceFields = section.fields.filter((f) => f.type === "select" && !f.options?.multiple);
  const entries = files.map((file) => {
    const { data, body } = parseMarkdown(fs.readFileSync(file, "utf8"));
    const name = path.basename(file) === "index.md" ? path.basename(path.dirname(file)) : path.basename(file, ".md");
    return {
      file: rel(file),
      url: urlFor(file),
      title: String(data[section.primary] || data.title || name),
      date: dateField && data[dateField.name] ? String(data[dateField.name]) : null,
      draft: !!data.draft,
      isBook: !!data.isBook,   // studiotomby.com: book titles show in italics
      featuredImage: picField && typeof data[picField.name] === "string" ? data[picField.name] : null,
      choices: Object.fromEntries(choiceFields.map((f) => [f.name, data[f.name] == null ? null : String(data[f.name])])),
      excerpt: excerptOf(data, body),
    };
  });
  entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || a.title.localeCompare(b.title));
  return entries;
}

// the first words of the first text block, or of the text under the front matter
// (shown under the title in the post list)
function excerptOf(data, body = "") {
  const block = (Array.isArray(data.blocks) ? data.blocks : []).find((b) => b && typeof b.text === "string" && b.text.trim());
  const text = block ? block.text : String(body || "");
  if (!text.trim()) return "";
  const words = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ").replace(/[*_#>`\\]/g, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 14).join(" ") + (words.length > 14 ? "…" : "");
}

// ---------- opening and saving ----------

// the section a list entry ("src/_data/projects.json#3") belongs to
const listSectionOf = (file) => {
  const { file: path_ } = listfile.splitEntry(file);
  const s = loadConfig().sections.find((x) => x.store === "list" && x.path === path_);
  if (!s) throw Object.assign(new Error("No section in .pages.yml for " + path_), { status: 404 });
  return s;
};

function readEntry(file) {
  if (listfile.isListEntry(file)) return listfile.readEntry(file, urlMaker(listSectionOf(file)));
  const full = inSite(file);
  const text = fs.readFileSync(full, "utf8");
  if (full.endsWith(".json")) return { file: rel(full), data: JSON.parse(text), body: "" };
  const { data, body } = parseMarkdown(text);
  return { file: rel(full), url: urlFor(full), data, body };
}

// the text a file would contain (used for saving, and for the live preview)
const serialize = (file, data, body) => listfile.isListEntry(file) ? listfile.draftText(file, data)
  : file.endsWith(".json")
  ? JSON.stringify(clean(data), null, 2) + "\n"
  : stringifyMarkdown(data, body);

function writeEntry(file, data, body, version) {
  if (listfile.isListEntry(file)) return listfile.writeEntry(file, data, version, urlMaker(listSectionOf(file)));
  const full = inSite(file);
  if (!fs.existsSync(full)) throw Object.assign(new Error("File not found: " + file), { status: 404 });
  fs.writeFileSync(full, serialize(file, data, body), "utf8");
  return readEntry(file);
}

// ---------- creating ----------

const slugify = (s) => String(s || "")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";

function localIsoDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

// slug: the last part of its web address (/blog/2026/10/<slug>/); made from the title if empty
// extra: other text fields to fill in at the start, e.g. { longTitle: "…" } (only fields the section has)
function createEntry(sectionName, title, slug, extra = {}) {
  const section = findSection(sectionName);
  extra = Object.fromEntries(Object.entries(extra || {}).filter(([k, v]) => v && section.fields.some((f) => f.name === k && (!f.type || f.type === "string"))));
  if (section.store === "list") return listfile.createEntry(section, title, slugify(slug || title), urlMaker(section), extra);
  const now = new Date();
  const template = section.filename || "{primary}/index.md";
  let relPath = template
    .replace("{year}", String(now.getFullYear()))
    .replace("{month}", String(now.getMonth() + 1).padStart(2, "0"))
    .replace("{day}", String(now.getDate()).padStart(2, "0"))
    .replace("{primary}", slugify(slug || title));
  // don't overwrite an existing entry: add -2, -3...
  let full = inSite(path.join(section.path, relPath));
  for (let n = 2; fs.existsSync(full); n++) {
    full = inSite(path.join(section.path, /\/index\.md$/.test(relPath) ? relPath.replace(/\/index\.md$/, `-${n}/index.md`) : relPath.replace(/(\.md)?$/, `-${n}.md`)));
  }
  const data = {};
  for (const f of section.fields) {
    if (f.name === "title") data.title = title;
    else if (extra[f.name]) data[f.name] = String(extra[f.name]);
    else if (f.default !== undefined) data[f.name] = f.default;
    else if (f.name === "date" || (f.type === "date" && f === section.fields.find((x) => x.type === "date"))) data[f.name] = localIsoDate(now);
    else if (f.name === "draft") data.draft = true;   // new posts start as drafts
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, stringifyMarkdown(data, ""), "utf8");
  return readEntry(rel(full));
}

// ---------- deleting (into .cms-trash/, so nothing is ever really lost) ----------


const trashStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function deleteEntry(file, stamp = trashStamp()) {
  if (listfile.isListEntry(file)) {
    const section = listSectionOf(file);
    return listfile.deleteEntry(file, (item) => ownFolders(section.fields, item), stamp);
  }
  const full = inSite(file);
  const folder = path.dirname(full);
  if (!full.endsWith(".md") || !folder.startsWith(site.contentDir() + path.sep)) {
    throw Object.assign(new Error("Only posts and projects can be deleted here"), { status: 400 });
  }
  // a post in its own folder takes the folder with it; a post that's one .md file, just that file
  const own = path.basename(full) === "index.md" ? folder : full;
  const move = (from) => {
    if (!fs.existsSync(from)) return null;
    const to = path.join(site.trashDir(), stamp, rel(from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return rel(to);
  };
  const images = imageFolderFor(file);
  return { movedTo: [move(own), move(images)].filter(Boolean) };
}

// several at once (the list's Select), into one .cms-trash folder. Items of a list file go
// last-first, so taking one out doesn't change the place of the ones still to go.
function deleteEntries(files) {
  const stamp = trashStamp();
  const place = (f) => { const m = /#(\d+)$/.exec(f); return m ? Number(m[1]) : -1; };
  const order = [...new Set(files.map(String))].sort((a, b) => place(b) - place(a));
  const movedTo = [], failed = [];
  for (const f of order) {
    try { movedTo.push(...deleteEntry(f, stamp).movedTo); }
    catch (err) { failed.push({ file: f, error: err.message }); }
  }
  return { movedTo, failed, deleted: order.length - failed.length };
}

// ---------- reordering (lists only: their order is the site's order) ----------

function moveEntry(sectionName, from, to) {
  const section = findSection(sectionName);
  if (section.store !== "list") throw Object.assign(new Error("Only lists can be reordered."), { status: 400 });
  return listfile.moveEntry(section, Number(from), Number(to));
}

// ---------- pictures kept as just a file name ----------
// An image field can say where its pictures live, and to save only the file name:
//   options: { path: "src/img/projects/{slug}", store: filename }
// {slug} (or any other field in braces) is filled from the entry. Pages CMS knows "path" (the
// folder its picker opens in); "store" is w·i·p cms's own.

const folderOf = (field, item) => field.options?.path ? fill(String(field.options.path).replace(/^\/+|\/+$/g, ""), (n) => item?.[n]) : null;

// what to show for a stored value: "photo.jpg" -> "/img/projects/my-project/photo.jpg"
function imageUrl(field, value, item) {
  const v = String(value);
  if (/^(https?:|data:|\/)/.test(v)) return v;
  const folder = field.options?.store === "filename" && folderOf(field, item);
  if (folder) { try { return site.fileToImageUrl(inSite(path.join(folder, v))); } catch { return null; } }
  return v;
}

// an entry's own image folders (the ones named after it, like src/img/projects/{slug}),
// which go to the Trash with it
function ownFolders(fields, item, out = new Set()) {
  for (const f of fields || []) {
    if (f.type === "image" && /\{\w+\}/.test(String(f.options?.path || ""))) { const d = folderOf(f, item); if (d) out.add(d); }
    if (f.type === "object") ownFolders(f.fields, item, out);   // folders are filled from the entry's own fields
  }
  return [...out];
}

const listFileOf = (sectionName) => findSection(sectionName).path;

module.exports = { listFileOf, listEntries, readEntry, writeEntry, createEntry, deleteEntry, deleteEntries, moveEntry, serialize, slugify, imageUrl };
