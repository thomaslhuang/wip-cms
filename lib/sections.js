// Adding a collection or a page to a site that's already set up (the + at the bottom of the
// sidebar). It writes the new section into .pages.yml and makes the place its content lives.
//
// Sites keep things in different ways, so a new section copies an existing one by default:
//   fieldsFrom: "projects"   the same fields as Projects (and, unless told otherwise, kept
//                            the same way: Markdown files in a folder, or a list in a data file)
//   fieldsFrom: "posts" / "simple"   a fresh start: title, picture, date, draft, tags /
//                            title and text
// Picture folders named after the copied section (src/img/projects/{slug}) are renamed for
// the new one (src/img/exhibitions/{slug}).
//
// What it can't do is make the site show the new section: that needs a template on the site
// itself (an Eleventy layout, say), which is different for every site. nextStep() says what.
//
// .pages.yml is edited as text: the new entry is added after the last one in the right place,
// and nothing else in the file changes (comments, spacing and all).
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const site = require("./site");
const { loadConfig, CONFIG_FILE } = require("./config");
const { sectionConfig } = require("./setup");

const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const fail = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };

// what the "Add" window needs to know about this site
function options() {
  const { sections } = loadConfig();
  const { contentRoot } = site.requireSite();
  const groups = [...new Set(sections.filter((s) => s.group).map((s) => s.group))];
  return {
    contentRoot,
    dataDir: path.posix.join(contentRoot === "." ? "" : contentRoot, "_data"),
    groups,
    sections: sections.map((s) => ({ name: s.name, label: s.label, kind: s.kind, store: s.store, group: s.group, path: s.path })),
  };
}

// where a new section's content goes, from its name and how it's kept
function defaultPath(kind, store, name) {
  const { contentRoot } = site.requireSite();
  const root = contentRoot === "." ? "" : contentRoot;
  const data = path.posix.join(root, "_data");
  if (kind === "collection") return store === "list" ? `${data}/${name}.json` : path.posix.join(root, name);
  return store === "md" ? path.posix.join(root, name, "index.md") : `${data}/${name}.json`;
}

function add(plan) {
  const kind = plan.kind === "page" ? "page" : "collection";
  const label = String(plan.label || "").trim();
  if (!label) fail("Give it a name.");
  const { sections } = loadConfig();
  let name = slug(label) || "section";
  for (let n = 2; sections.some((s) => s.name === name); n++) name = `${slug(label)}-${n}`;
  const source = sections.find((s) => s.name === plan.fieldsFrom);
  const store = kind === "collection" ? (plan.store === "list" ? "list" : "files") : (plan.store === "md" ? "md" : "json");
  const file = String(plan.path || defaultPath(kind, store, name)).replace(/^\/+|\/+$/g, "");
  if (sections.some((s) => s.path === file)) fail(`Another section already uses ${file}.`);
  const full = site.inSite(file);
  if (kind === "page" && fs.existsSync(full)) fail(`${file} is already there. Pick another name or place.`);

  // ----- its fields -----
  let fields, extra = {};
  if (source) {
    const oldNames = [source.name, path.basename(source.path).replace(/\.(json|ya?ml|md)$/i, ""), source.path.split("/").pop()];
    fields = renameFolders(JSON.parse(JSON.stringify(source.fields)), oldNames, name);
    if (source.kind === "collection" && kind === "collection") {
      if (source.view && Object.keys(source.view).length) extra.view = source.view;
      if (store === "files" && source.store === "files" && source.filename) extra.filename = source.filename;
    }
    // a list item has no "body" under front matter, and a Markdown page needs one for its text
    if (store === "list" || store === "json") fields = fields.map((f) => (f.name === "body" ? { ...f, name: "text" } : f));
  } else {
    const preset = sectionConfig({ label, folder: name, kind: plan.fieldsFrom === "posts" ? "dated" : "pages", content: store === "files" ? plan.content : "text" }, ".");
    fields = preset.fields;
    if (store !== "files" && store !== "md") fields = fields.map((f) => (f.name === "body" ? { ...f, name: "text" } : f));
    if (kind === "collection") {
      if (preset.view?.default) extra.view = { primary: "title", default: preset.view.default };
      if (store === "files") {
        const sibling = sections.find((s) => s.store === "files" && s.filename);
        extra.filename = sibling ? sibling.filename : "{primary}/index.md";
      }
    }
  }

  // ----- the entry in .pages.yml -----
  const entry = {
    name, label,
    type: kind === "collection" && store === "files" ? "collection" : "file",
    path: file,
    ...(store === "list" ? { format: "json", list: true } : store === "json" ? { format: "json" } : {}),
    ...extra,
    fields,
  };
  if (typeof entry.filename === "string") entry.filename = { template: entry.filename, field: false };
  insertEntry(entry, kind === "page" ? plan.group || null : null, kind);

  // ----- the place its content lives -----
  if (store === "files") fs.mkdirSync(full, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!fs.existsSync(full)) {
      const text = store === "list" ? "[]\n" : store === "json" ? "{}\n" : `---\ntitle: ${JSON.stringify(label)}\n---\n`;
      fs.writeFileSync(full, text, "utf8");
    }
  }
  return { name, kind, store, path: file, next: nextStep(kind, store, name, file) };
}

// picture folders named after the copied section get the new name:
// src/img/projects/{slug} -> src/img/exhibitions/{slug}
function renameFolders(fields, oldNames, name) {
  const names = [...new Set(oldNames.filter(Boolean))];
  for (const f of fields) {
    if (f.options?.path) {
      f.options.path = String(f.options.path).split("/").map((part) => (names.includes(part) ? name : part)).join("/");
    }
    if (Array.isArray(f.fields)) renameFolders(f.fields, oldNames, name);
    if (Array.isArray(f.blocks)) for (const b of f.blocks) if (Array.isArray(b.fields)) renameFolders(b.fields, oldNames, name);
  }
  return fields;
}

// add the entry to .pages.yml: into a group's items, or to the top-level list (collections go
// after the last top-level collection, pages at the end)
function insertEntry(entry, groupName, kind) {
  const file = site.inSite(CONFIG_FILE);
  const text = fs.readFileSync(file, "utf8");
  const doc = YAML.parseDocument(text);
  const content = doc.get("content", true);
  if (!YAML.isSeq(content)) fail(".pages.yml has no content list to add to.");
  let seq = content, after = null;
  if (groupName) {
    const group = content.items.find((it) => YAML.isMap(it) && it.get("type") === "group" && (it.get("label") === groupName || it.get("name") === groupName));
    const items = group && group.get("items", true);
    if (!YAML.isSeq(items) || !items.items.length) fail(`Couldn't find the group “${groupName}” in .pages.yml.`);
    seq = items;
  } else if (kind === "collection") {
    after = [...content.items].reverse().find((it) => YAML.isMap(it) && (it.get("type") === "collection" || it.get("list") === true));
  }
  const last = after || seq.items[seq.items.length - 1];
  if (!last) fail(".pages.yml's content list is empty.");
  // the column its items start at ("  - name: …" -> the dash's column)
  const lineStart = text.lastIndexOf("\n", last.range[0] - 1) + 1;
  const dash = text.slice(lineStart, last.range[0]).search(/-/);
  const indent = " ".repeat(dash >= 0 ? dash : last.range[0] - lineStart);
  // after the last item's last line
  let end = last.range[2];
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  const lineEnd = text.indexOf("\n", end);
  const at = lineEnd === -1 ? text.length : lineEnd + 1;
  const body = YAML.stringify(entry, { lineWidth: 0, flowCollectionPadding: false }).trimEnd().split("\n");
  const block = "\n" + body.map((line, i) => (i === 0 ? `${indent}- ${line}` : `${indent}  ${line}`)).join("\n") + "\n";
  const out = text.slice(0, at) + (lineEnd === -1 ? "\n" : "") + block + text.slice(at);
  // check it reads back, before writing
  const check = YAML.parse(out);
  if (!JSON.stringify(check).includes(JSON.stringify(entry.path))) fail("Couldn't add it to .pages.yml safely; nothing was changed.");
  fs.writeFileSync(file, out, "utf8");
}

// what the site itself still needs, in plain words
function nextStep(kind, store, name, file) {
  const key = file.replace(/^.*_data\//, "").replace(/\.(json|ya?ml)$/i, "").split("/").join(".");
  if (kind === "collection" && store === "list") return `Its items are in ${file}. To show them on the site, a template needs to use them (in Eleventy they're available as “${key}”; one page per item needs pagination over ${key}).`;
  if (kind === "collection") return `Each entry is a Markdown file in ${file}/. To show them on the site, they need a layout (in Eleventy, a ${name}.json in that folder with a "layout" usually does it), and a page that lists them.`;
  if (store === "json") return `Its content is in ${file}. To show it on the site, a template needs to use it (in Eleventy it's available as “${key}”).`;
  return `It's a Markdown page at ${file}. To show it on the site it needs a layout, like the site's other pages.`;
}

module.exports = { options, add, defaultPath };
