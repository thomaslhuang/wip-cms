// Listing, opening, saving, creating and deleting content.
//
//   collections (blog posts, projects): one Markdown file per entry, either in its own
//     folder (src/blog/2026/10/on-mexico-city/index.md) or not (src/blog/on-mexico-city.md)
//   files (home, about, site settings...): one file each, e.g. src/_data/home.json
const fs = require("fs");
const path = require("path");
const site = require("./site");
const { inSite, rel, urlFor, imageFolderFor } = site;
const { parseMarkdown, stringifyMarkdown, clean } = require("./frontmatter");
const { findSection } = require("./config");

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
      title: String(data.title || name),
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

function readEntry(file) {
  const full = inSite(file);
  const text = fs.readFileSync(full, "utf8");
  if (full.endsWith(".json")) return { file: rel(full), data: JSON.parse(text), body: "" };
  const { data, body } = parseMarkdown(text);
  return { file: rel(full), url: urlFor(full), data, body };
}

// the text a file would contain (used for saving, and for the live preview)
const serialize = (file, data, body) => file.endsWith(".json")
  ? JSON.stringify(clean(data), null, 2) + "\n"
  : stringifyMarkdown(data, body);

function writeEntry(file, data, body) {
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
function createEntry(sectionName, title, slug) {
  const section = findSection(sectionName);
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
    else if (f.default !== undefined) data[f.name] = f.default;
    else if (f.name === "date" || (f.type === "date" && f === section.fields.find((x) => x.type === "date"))) data[f.name] = localIsoDate(now);
    else if (f.name === "draft") data.draft = true;   // new posts start as drafts
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, stringifyMarkdown(data, ""), "utf8");
  return readEntry(rel(full));
}

// ---------- deleting (into .cms-trash/, so nothing is ever really lost) ----------


function deleteEntry(file) {
  const full = inSite(file);
  const folder = path.dirname(full);
  if (!full.endsWith(".md") || !folder.startsWith(site.contentDir() + path.sep)) {
    throw Object.assign(new Error("Only posts and projects can be deleted here"), { status: 400 });
  }
  // a post in its own folder takes the folder with it; a post that's one .md file, just that file
  const own = path.basename(full) === "index.md" ? folder : full;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
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

module.exports = { listEntries, readEntry, writeEntry, createEntry, deleteEntry, serialize, slugify };
