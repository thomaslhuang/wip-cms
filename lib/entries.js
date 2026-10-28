// Listing, opening, saving, creating and deleting content.
//
//   collections (blog posts, projects): one folder per entry with an index.md inside,
//     e.g. src/blog/2026/10/on-mexico-city/index.md
//   files (home, about, site settings...): one JSON file each, e.g. src/_data/home.json
const fs = require("fs");
const path = require("path");
const site = require("./site");
const { inSite, rel, urlFor, imageFolderFor } = site;
const { parseMarkdown, stringifyMarkdown, clean } = require("./frontmatter");
const { findSection } = require("./config");

// ---------- listing ----------

function findIndexFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("._")) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...findIndexFiles(full));
    else if (name === "index.md") out.push(full);
  }
  return out;
}


function listEntries(sectionName) {
  const section = findSection(sectionName);
  const files = findIndexFiles(inSite(section.path));
  const entries = files.map((file) => {
    const { data } = parseMarkdown(fs.readFileSync(file, "utf8"));
    return {
      file: rel(file),
      url: urlFor(file),
      title: data.title || path.basename(path.dirname(file)),
      longTitle: data.longTitle || null,
      date: data.date ? String(data.date) : null,
      draft: !!data.draft,
      category: data.category || null,
      isBook: !!data.isBook,
      featuredImage: data.featuredImage || null,
      blockCount: Array.isArray(data.blocks) ? data.blocks.length : 0,
      excerpt: excerptOf(data),
    };
  });
  entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || a.title.localeCompare(b.title));
  return entries;
}

// the first words of the first text block (shown under the title in the post list)
function excerptOf(data) {
  const block = (Array.isArray(data.blocks) ? data.blocks : []).find((b) => b && typeof b.text === "string" && b.text.trim());
  if (!block) return "";
  const words = block.text
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
    .replace("{primary}", slugify(slug || title));
  // don't overwrite an existing entry: add -2, -3...
  let full = inSite(path.join(section.path, relPath));
  for (let n = 2; fs.existsSync(full); n++) {
    full = inSite(path.join(section.path, relPath.replace(/\/index\.md$/, `-${n}/index.md`)));
  }
  const data = {};
  for (const f of section.fields) {
    if (f.name === "title") data.title = title;
    else if (f.default !== undefined) data[f.name] = f.default;
    else if (f.name === "date") data.date = localIsoDate(now);
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
  if (path.basename(full) !== "index.md" || !folder.startsWith(site.contentDir() + path.sep)) {
    throw Object.assign(new Error("Only posts and projects can be deleted here"), { status: 400 });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const move = (from) => {
    if (!fs.existsSync(from)) return null;
    const to = path.join(site.trashDir(), stamp, rel(from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return rel(to);
  };
  const images = imageFolderFor(file);
  return { movedTo: [move(folder), move(images)].filter(Boolean) };
}

module.exports = { listEntries, readEntry, writeEntry, createEntry, deleteEntry, serialize, slugify };
