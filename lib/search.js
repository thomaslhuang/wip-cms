// Searching every section at once: titles and text of posts, projects and pages.
//
// Looks inside the entries' fields and text (not at picture addresses). Every word you type has
// to be found, in any order, ignoring capitals. Matches in a title come first.
const fs = require("fs");
const site = require("./site");
const { loadConfig } = require("./config");
const listfile = require("./listfile");
const { urlMaker } = require("./permalinks");

const NOT_TEXT = /^(https?:|data:|\/|#|\d{4}-\d\d-\d\d)|\.(webp|jpe?g|png|gif|svg|avif|heic|mp4|mov|webm|pdf)$/i;
const LIMIT = 60;

// every piece of text in some data (skipping addresses and file names)
function strings(value, out = []) {
  if (typeof value === "string") { if (value.trim() && !NOT_TEXT.test(value.trim())) out.push(value); }
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}
const plain = (md) => String(md).replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, " ").replace(/[*_`>#]+/g, "");

function snippet(text, word) {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(word);
  if (at < 0) return flat.slice(0, 90);
  const from = Math.max(0, at - 35);
  return (from ? "…" : "") + flat.slice(from, from + 100) + (from + 100 < flat.length ? "…" : "");
}

function run(query, entries) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return { results: [] };
  const hits = [];
  const check = (section, file, item, body, url) => {
    const title = String(item[section.primary] ?? item.title ?? "");
    const parts = [...strings(item), body || ""].map(plain).filter((x) => x.trim());
    const text = parts.join("\n");
    const haystack = (title + "\n" + text).toLowerCase();
    if (!words.every((w) => haystack.includes(w))) return;
    // show the passage the first word was found in, not the whole entry run together
    const word = words.find((w) => text.toLowerCase().includes(w)) || words[0];
    const passage = parts.find((x) => x.toLowerCase().includes(word)) || "";
    hits.push({
      file, section: section.kind === "collection" ? section.name : null, sectionLabel: section.label,
      title: title || file.split("/").slice(-2).join("/"),
      url: url || null,   // the page it makes on the site, for links
      inTitle: words.every((w) => title.toLowerCase().includes(w)),
      snippet: snippet(passage, word),
    });
  };
  for (const section of loadConfig().sections) {
    try {
      if (section.store === "list") {
        const pageUrl = urlMaker(section);
        listfile.readList(section.path).items.forEach((item, i) => item && typeof item === "object" && check(section, listfile_id(section, i), item, "", pageUrl(item)));
      } else if (section.kind === "collection") {
        for (const e of entries.listEntries(section.name)) {
          const read = entries.readEntry(e.file);
          check(section, e.file, read.data || {}, read.body, e.url);
        }
      } else if (section.path && fs.existsSync(site.inSite(section.path))) {
        const read = entries.readEntry(section.path);
        check(section, section.path, read.data || {}, read.body, read.url);
      }
    } catch { /* a section that can't be read is skipped */ }
  }
  hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  return { results: hits.slice(0, LIMIT), total: hits.length };
}
const listfile_id = (section, i) => `${section.path}#${i}`;

module.exports = { run, strings };
