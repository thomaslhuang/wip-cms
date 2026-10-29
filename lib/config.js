// Reads .pages.yml, the same settings file Pages CMS uses, so both editors always show the
// same fields. Change a field there and it changes in both.
//
// What comes out: a flat list of "sections" for the sidebar:
//   { name, label, kind: "collection", path, fields, filename, ... }   blog posts, projects
//   { name, label, kind: "file", path, fields }                       home, about, settings...
//   { name, label, kind: "collection", store: "list", path, ... }     a list in one data file
const fs = require("fs");
const yaml = require("js-yaml");
const { inSite } = require("./site");

const CONFIG_FILE = ".pages.yml";

function loadConfig() {
  const raw = yaml.load(fs.readFileSync(inSite(CONFIG_FILE), "utf8")) || {};
  const sections = [];
  const walk = (items, group) => {
    for (const item of items || []) {
      if (item.type === "group") { walk(item.items, item.label || item.name); continue; }
      // a file that's a whole list (Pages CMS: type: file, list: true), like a site that keeps
      // its projects in src/_data/projects.json: each item is shown as an entry of its own
      const isList = item.type === "file" && item.list === true && /\.(json|ya?ml)$/i.test(item.path || "");
      sections.push({
        name: item.name,
        label: item.label || item.name,
        group: group || null,
        kind: item.type === "collection" || isList ? "collection" : "file",
        store: isList ? "list" : item.type === "collection" ? "files" : "file",
        path: item.path,
        fields: item.fields || [],
        filename: typeof item.filename === "string" ? item.filename : item.filename && item.filename.template,
        view: item.view || {},
        // the field used as an entry's name (Pages CMS's view.primary; else title, else the first text field)
        primary: (item.view && item.view.primary) || ((item.fields || []).some((f) => f.name === "title") ? "title"
          : ((item.fields || []).find((f) => !f.type || f.type === "string") || {}).name || "title"),
        // w·i·p cms only: the address of an entry's page, e.g. "/projects/{slug}/" (list files; worked
        // out from the site's Eleventy templates when not given)
        url: item.url || null,
      });
    }
  };
  walk(raw.content);
  return { media: raw.media || {}, sections };
}

const findSection = (name) => {
  const s = loadConfig().sections.find((x) => x.name === name);
  if (!s) throw Object.assign(new Error("No such section: " + name), { status: 404 });
  return s;
};

module.exports = { loadConfig, findSection, CONFIG_FILE };
