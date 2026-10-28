// Tag suggestions. The list of tags offered in Pages CMS lives on one line of .pages.yml
// (marked "# tags: kept up to date automatically"). After each save, this rewrites that
// line with every tag used by any post, so a tag you add here shows up on your phone too.
// Sites without that marker are left alone.
const fs = require("fs");
const path = require("path");
const { inSite } = require("./site");
const { loadConfig } = require("./config");
const { parseMarkdown } = require("./frontmatter");
const { listEntries } = require("./entries");

const MARKER = "# tags: kept up to date automatically";
const PLAIN = /^[A-Za-z0-9][A-Za-z0-9 _&.'-]*$/;
const quote = (v) => (PLAIN.test(v) && v.trim() === v ? v : JSON.stringify(v));

function allTags() {
  const seen = new Map();
  const sections = loadConfig().sections.filter((s) => s.kind === "collection" && s.fields.some((f) => f.name === "tags"));
  for (const e of sections.flatMap((s) => listEntries(s.name))) {
    const { data } = parseMarkdown(fs.readFileSync(inSite(e.file), "utf8"));
    for (const t of data.tags || []) if (t && !seen.has(String(t).toLowerCase())) seen.set(String(t).toLowerCase(), String(t));
  }
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function syncTagSuggestions() {
  const file = inSite(".pages.yml");
  const text = fs.readFileSync(file, "utf8");
  const line = new RegExp("^([ \\t]*values:[ \\t]*)\\[.*\\]([ \\t]*" + MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")[ \\t]*$", "m");
  if (!line.test(text)) return null;
  const tags = allTags();
  const updated = text.replace(line, (_, a, b) => a + "[" + tags.map(quote).join(", ") + "]" + b);
  if (updated !== text) fs.writeFileSync(file, updated, "utf8");
  return tags;
}

module.exports = { allTags, syncTagSuggestions };
