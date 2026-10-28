// Reads .pages.yml, the same settings file Pages CMS uses, so both editors always show the
// same fields. Change a field there and it changes in both.
//
// What comes out: a flat list of "sections" for the sidebar:
//   { name, label, kind: "collection", path, fields, filename, ... }   blog posts, projects
//   { name, label, kind: "file", path, fields }                       home, about, settings...
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
      sections.push({
        name: item.name,
        label: item.label || item.name,
        group: group || null,
        kind: item.type === "collection" ? "collection" : "file",
        path: item.path,
        fields: item.fields || [],
        filename: typeof item.filename === "string" ? item.filename : item.filename && item.filename.template,
        view: item.view || {},
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
