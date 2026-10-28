// Reading and writing the "---" YAML block at the top of index.md files, and JSON data files.
//
// Dates are kept exactly as written (no conversion to Date objects), so saving a file
// you didn't change leaves its dates untouched.
const yaml = require("js-yaml");

const SCHEMA = yaml.CORE_SCHEMA; // strings, numbers, true/false, null; no automatic dates

function parseMarkdown(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: String(text) };
  const data = yaml.load(m[1], { schema: SCHEMA }) || {};
  return { data, body: m[2] };
}

function stringifyMarkdown(data, body = "") {
  const front = yaml.dump(clean(data), {
    schema: SCHEMA,
    lineWidth: -1,      // never fold long text onto several lines
    noRefs: true,
    quotingType: '"',
  });
  return "---\n" + front + "---\n" + (body || "");
}

// drop empty values the editor may leave behind (empty strings in optional fields etc.)
function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (c === undefined || c === "" || c === null) continue;
      out[k] = c;
    }
    return out;
  }
  return value;
}

module.exports = { parseMarkdown, stringifyMarkdown, clean };
