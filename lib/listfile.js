// Sections kept as one list in a data file, e.g. src/_data/projects.json:
//
//   [ { "title": "blurring boundaries", "slug": "blurring-boundaries", "year": 2023, ... }, ... ]
//
// In .pages.yml that's a "file" with list: true (the Pages CMS way of saying it). w·i·p cms shows
// each item as an entry of its own, like a blog post. An entry's address in w·i·p cms is the
// file plus its place in the list: "src/_data/projects.json#3".
//
// The list's order is the site's order (Eleventy shows them as they are in the file), so
// new items go at the top and you can drag them into place.
//
// Saving changes only that one item, and keeps the file's own indentation, so a save shows
// up in GitHub Desktop as just the lines you changed.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const yaml = require("js-yaml");
const site = require("./site");
const { inSite, rel } = site;

const isListEntry = (file) => /#\d+$/.test(String(file));
function splitEntry(file) {
  const m = /^(.*)#(\d+)$/.exec(String(file));
  if (!m) throw Object.assign(new Error("Not a list entry: " + file), { status: 400 });
  return { file: m[1], index: Number(m[2]) };
}
const entryId = (file, index) => `${file}#${index}`;

// ---------- reading and writing the whole file ----------

const isYaml = (file) => /\.ya?ml$/i.test(file);
function readList(file) {
  const full = inSite(file);
  if (!fs.existsSync(full)) return { items: [], indent: "  ", newline: true };
  const text = fs.readFileSync(full, "utf8");
  const items = isYaml(file) ? yaml.load(text, { schema: yaml.CORE_SCHEMA }) || [] : JSON.parse(text);
  if (!Array.isArray(items)) throw Object.assign(new Error(`${file} isn't a list. In .pages.yml, list: true is for files that are a list of items.`), { status: 400 });
  return { items, indent: (text.match(/\n([ \t]+)\S/) || [, "  "])[1], newline: text.endsWith("\n") };
}
function textOf(file, list) {
  if (isYaml(file)) return yaml.dump(list.items, { schema: yaml.CORE_SCHEMA, lineWidth: -1, noRefs: true, quotingType: '"' });
  return JSON.stringify(list.items, null, list.indent) + (list.newline ? "\n" : "");
}
function writeList(file, list) {
  fs.writeFileSync(inSite(file), textOf(file, list), "utf8");
}

// a short fingerprint of an item, so a save can tell if the list changed underneath it
// (reordered in another window, or edited outside w·i·p cms)
const versionOf = (item) => crypto.createHash("sha1").update(JSON.stringify(item ?? null)).digest("hex").slice(0, 12);

// ---------- what goes in the post list ----------

function listEntries(section, { pageUrl, imageUrl, excerptOf }) {
  const { items } = readList(section.path);
  const fields = section.fields;
  const picField = fields.find((f) => f.name === "featuredImage" || f.name === "thumb" || f.name === "thumbnail") ||
    fields.find((f) => f.type === "image" && !f.options?.multiple);
  const dateField = fields.find((f) => f.name === "date" && f.type === "date") || fields.find((f) => f.type === "date");
  // no date, but a year (2023, or "2016–2019"): grouped and sorted by its first year
  const yearField = !dateField && fields.find((f) => f.name === "year" && ["number", "string", undefined].includes(f.type));
  const textField = fields.find((f) => f.type === "rich-text") || fields.find((f) => f.type === "text");
  const choiceFields = fields.filter((f) => f.type === "select" && !f.options?.multiple);
  return items.map((item, index) => {
    const data = item && typeof item === "object" ? item : {};
    const pic = picField && data[picField.name];
    return {
      file: entryId(section.path, index),
      order: index,
      url: pageUrl(data),
      title: String(data[section.primary] ?? data.title ?? `#${index + 1}`),
      date: dateField && data[dateField.name] ? String(data[dateField.name])
        : yearField && /^\d{4}/.test(String(data[yearField.name] ?? "")) ? String(data[yearField.name]).slice(0, 4) : null,
      draft: !!data.draft,
      featuredImage: typeof pic === "string" && pic ? imageUrl(picField, pic, data) : null,
      choices: Object.fromEntries(choiceFields.map((f) => [f.name, data[f.name] == null ? null : String(data[f.name])])),
      excerpt: textField ? excerptOf({}, String(data[textField.name] || "")) : "",
    };
  });
}

// ---------- one entry ----------

function readEntry(id, pageUrl) {
  const { file, index } = splitEntry(id);
  const { items } = readList(file);
  if (index >= items.length) throw Object.assign(new Error("This item isn't in the list any more. It may have been moved or deleted."), { status: 404 });
  const item = items[index];
  return { file: id, url: pageUrl(item), data: item, body: "", version: versionOf(item) };
}

function writeEntry(id, data, version, pageUrl) {
  const { file, index } = splitEntry(id);
  const list = readList(file);
  if (index >= list.items.length || (version && versionOf(list.items[index]) !== version)) {
    throw Object.assign(new Error("This list was changed somewhere else (another window, or outside w·i·p cms). Reopen the item to see the latest, then make your change again."), { status: 409 });
  }
  list.items[index] = tidy(data);
  writeList(file, list);
  return readEntry(id, pageUrl);
}

// what the file would say with this item changed (for the live preview, before saving)
function draftText(id, data) {
  const { file, index } = splitEntry(id);
  const list = readList(file);
  list.items[index] = tidy(data);
  return textOf(file, list);
}

// values the editor leaves behind that weren't there before: undefined goes (JSON does that
// itself); empty strings and empty lists that the item already had are kept as they were
function tidy(value) {
  if (Array.isArray(value)) return value.map(tidy).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) { const c = tidy(v); if (c !== undefined) out[k] = c; }
    return out;
  }
  return value;
}

// a new item at the top of the list. The name goes in the primary field, the permalink in
// "slug" if there is one; fields with defaults get them.
function createEntry(section, title, slug, pageUrl) {
  const list = readList(section.path);
  const item = {};
  for (const f of section.fields) {
    if (f.name === section.primary) item[f.name] = title;
    else if (f.name === "slug") item.slug = slug;
    else if (f.default !== undefined) item[f.name] = f.default;
    else if (f.type === "date" && f === section.fields.find((x) => x.type === "date")) item[f.name] = new Date().toISOString().slice(0, 10);
    else if (f.name === "year") item.year = f.type === "number" ? new Date().getFullYear() : String(new Date().getFullYear());
  }
  if (!(section.primary in item)) item[section.primary] = title;
  list.items.unshift(item);
  writeList(section.path, list);
  return readEntry(entryId(section.path, 0), pageUrl);
}

// out of the list, into .cms-trash/ as a small file of its own (plus its own image folders)
function deleteEntry(id, ownFolders) {
  const { file, index } = splitEntry(id);
  const list = readList(file);
  const [item] = list.items.splice(index, 1);
  if (!item) throw Object.assign(new Error("This item isn't in the list any more."), { status: 404 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = String(item.slug || item.title || "item-" + (index + 1)).replace(/[^\w.\- ]+/g, "-");
  const to = path.join(site.trashDir(), stamp, file.replace(/\.(json|ya?ml)$/i, ""), name + ".json");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, JSON.stringify({ from: file, position: index + 1, item }, null, 2) + "\n");
  const moved = [rel(to)];
  for (const folder of ownFolders(item)) {
    const full = inSite(folder);
    if (!fs.existsSync(full)) continue;
    const dest = path.join(site.trashDir(), stamp, folder);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(full, dest);
    moved.push(rel(dest));
  }
  writeList(file, list);
  return { movedTo: moved };
}

// move the item at "from" to "to" (both 0-based). Returns the new ids, so an open item can follow.
function moveEntry(section, from, to) {
  const list = readList(section.path);
  if (from < 0 || from >= list.items.length || to < 0 || to >= list.items.length) throw Object.assign(new Error("Can't move there."), { status: 400 });
  const [item] = list.items.splice(from, 1);
  list.items.splice(to, 0, item);
  writeList(section.path, list);
  return { ok: true };
}

module.exports = { isListEntry, splitEntry, listEntries, readEntry, writeEntry, draftText, createEntry, deleteEntry, moveEntry, readList };
