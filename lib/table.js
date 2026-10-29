// The spreadsheet view (Settings → Advanced tools): every entry of a section as a row, its
// short fields as columns, edited in place, and rows pasted in from a spreadsheet.
//
//   lists in one data file (dosa's projects.json): a row is an item; changes go straight into
//     the file, all of a save's changes in one write, keeping the file's own indentation
//   collections (blog posts, projects): a row is a post; changes go into its front matter
//
// Long or nested things (the text of a post, galleries, blocks) aren't columns: those open in
// the editor as usual.
const fs = require("fs");
const path = require("path");
const site = require("./site");
const { inSite, rel } = site;
const { parseMarkdown, stringifyMarkdown } = require("./frontmatter");
const { findSection } = require("./config");
const listfile = require("./listfile");
const crypto = require("crypto");

const versionOf = (item) => crypto.createHash("sha1").update(JSON.stringify(item ?? null)).digest("hex").slice(0, 12);
const err = (message, status = 400) => Object.assign(new Error(message), { status });

// the rows: { file, version, data } for every entry, in the file's order (lists) or newest first
function rows(sectionName, entries) {
  const section = findSection(sectionName);
  if (section.store === "list") {
    const { items } = listfile.readList(section.path);
    return { rows: items.map((item, i) => ({ file: `${section.path}#${i}`, version: versionOf(item), data: item && typeof item === "object" ? item : {} })) };
  }
  // collections: the same files the list shows
  return { rows: entries.listEntries(sectionName).map((e) => {
    const { data } = parseMarkdown(fs.readFileSync(inSite(e.file), "utf8"));
    return { file: e.file, version: versionOf(data), data };
  }) };
}

// a value from a cell: "" clears the field (kept as "" if the item already had it that way,
// as some lists keep empty fields so every item has the same ones)
function put(data, field, value) {
  if (value === null || value === undefined || value === "") {
    if (value === "" && data[field] === "") return;
    if (data[field] !== undefined && typeof data[field] === "string" && value === "") { data[field] = ""; return; }
    delete data[field];
    return;
  }
  data[field] = value;
}

// another item already using this permalink?
function slugTaken(items, index, slug) {
  if (!slug) return false;
  return items.some((it, i) => i !== index && it && typeof it === "object" && String(it.slug ?? "") === String(slug));
}

// edits: [{ file, field, value, version }]. Returns the new versions, by file.
function save(sectionName, edits) {
  const section = findSection(sectionName);
  const known = new Set(section.fields.map((f) => f.name));
  for (const e of edits) if (!known.has(e.field)) throw err(`“${e.field}” isn't a field of ${section.label}.`);
  const versions = {};
  if (section.store === "list") {
    const list = listfile.readList(section.path);
    // every row's version is checked before anything is written: all or nothing
    for (const e of edits) {
      const { index } = listfile.splitEntry(e.file);
      if (index >= list.items.length || (e.version && versionOf(list.items[index]) !== e.version && !versions[e.file])) {
        throw err("This list was changed somewhere else (another window, or outside w·i·p cms). Your view has been refreshed; make the change again.", 409);
      }
      versions[e.file] = true;
    }
    for (const e of edits) {
      const { index } = listfile.splitEntry(e.file);
      const item = list.items[index] && typeof list.items[index] === "object" ? list.items[index] : (list.items[index] = {});
      if (e.field === "slug" && slugTaken(list.items, index, e.value)) throw err(`Another item already has the permalink “${e.value}”. Each one needs its own.`, 409);
      put(item, e.field, e.value);
    }
    listfile.writeList(section.path, list);
    for (const file of Object.keys(versions)) versions[file] = versionOf(list.items[listfile.splitEntry(file).index]);
    return { versions };
  }
  // collections: one file per row
  const byFile = new Map();
  for (const e of edits) (byFile.get(e.file) || byFile.set(e.file, []).get(e.file)).push(e);
  for (const [file, list] of byFile) {
    const full = inSite(file);
    if (!full.startsWith(inSite(section.path) + path.sep) || !full.endsWith(".md")) throw err("Not in " + section.label + ": " + file);
    const { data, body } = parseMarkdown(fs.readFileSync(full, "utf8"));
    if (list[0].version && versionOf(data) !== list[0].version) throw err(`“${data.title || file}” was changed somewhere else. Your view has been refreshed; make the change again.`, 409);
    for (const e of list) put(data, e.field, e.value);
    fs.writeFileSync(full, stringifyMarkdown(data, body), "utf8");
    versions[file] = versionOf(data);
  }
  return { versions };
}

// new rows (pasted below the last one, or the + under the table): { field: value } each.
// Lists: added after the last item (where you pasted them). A permalink is made from the
// title when there isn't one, and kept different from the others.
// Collections: each becomes a new post (a draft), named by its title column.
function add(sectionName, newRows, entries) {
  const section = findSection(sectionName);
  const known = new Set(section.fields.map((f) => f.name));
  const clean = (r) => Object.fromEntries(Object.entries(r || {}).filter(([k, v]) => known.has(k) && v !== "" && v != null));
  const primary = section.primary;
  if (section.store === "list") {
    const list = listfile.readList(section.path);
    const hasSlug = section.fields.some((f) => f.name === "slug");
    const start = list.items.length;
    for (const r of newRows) {
      const item = {};
      // in the order the fields are listed, like items added in w·i·p cms
      const data = clean(r);
      for (const f of section.fields) if (data[f.name] !== undefined) item[f.name] = data[f.name];
      if (hasSlug) {
        let slug = String(item.slug || entries.slugify(item[primary] || item.title || "item"));
        const base = slug;
        for (let n = 2; slugTaken(list.items, -1, slug); n++) slug = `${base}-${n}`;
        item.slug = slug;
      }
      list.items.push(item);
    }
    listfile.writeList(section.path, list);
    return { added: newRows.length, first: start };
  }
  let added = 0;
  const files = [];
  for (const r of newRows) {
    const data = clean(r);
    const title = data[primary] || data.title;
    if (!title) continue;
    const made = entries.createEntry(sectionName, String(title), "");
    const extra = Object.entries(data).filter(([k]) => k !== primary).map(([field, value]) => ({ file: made.file, field, value }));
    if (extra.length) save(sectionName, extra);
    files.push(made.file);
    added++;
  }
  return { added, files };
}

module.exports = { rows, save, add };
