// Checks on the site's pictures, for the Media page's "Check content":
//   unused pictures      files in the media library that no post, data file or template uses
//   pictures w/o alt     pictures in posts and pages with no description for screen readers
//   writing              stray formatting marks (**) and double spaces in the text (lib/textcheck.js)
//
// Alt text: a picture in a post counts as missing its description when
//   - Markdown has ![](photo.webp) with nothing between the brackets, or an <img> with no alt
//   - a block or list item has a picture and an "alt" that's empty
//   - a block or list item has a picture and no "alt" at all, but only where the section's
//     fields in .pages.yml have an "alt" field somewhere (so a site that doesn't do alt text
//     isn't flooded)
// A decorative picture can honestly have none, so this is a list to look through, not a rule.
const path = require("path");
const site = require("./site");
const { loadConfig } = require("./config");
const media = require("./media");
const { parseMarkdown } = require("./frontmatter");
const listfile = require("./listfile");
const yaml = require("js-yaml");
const { textIssues } = require("./textcheck");
const { fixEntry } = require("./textfix");

const IMG = /\.(webp|jpe?g|png|gif|avif|svg)$/i;
const isPicture = (v) => typeof v === "string" && IMG.test(v.trim().split(/[?#]/)[0]);

function pictureIn(obj) {
  for (const [k, v] of Object.entries(obj)) if (k !== "alt" && isPicture(v)) return v;
  return null;
}

// pictures with no description in some data. Returns the pictures' addresses.
function missingInData(node, altDeclared, depth = 0, out = []) {
  if (Array.isArray(node)) { node.forEach((v) => missingInData(v, altDeclared, depth + 1, out)); return out; }
  if (!node || typeof node !== "object") return out;
  const pic = pictureIn(node);
  if (pic) {
    const hasAlt = Object.prototype.hasOwnProperty.call(node, "alt");
    const blank = hasAlt && !String(node.alt ?? "").trim();
    if (blank || (!hasAlt && altDeclared && depth >= 1)) out.push(pic);
  }
  for (const v of Object.values(node)) if (v && typeof v === "object") missingInData(v, altDeclared, depth + 1, out);
  return out;
}

function missingInMarkdown(body) {
  const out = [];
  for (const m of String(body).matchAll(/!\[\s*\]\(\s*<?([^)\s>]+)[^)]*\)/g)) out.push(m[1]);
  for (const m of String(body).matchAll(/<img\b(?![^>]*\balt\s*=)[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) out.push(m[1]);
  return out;
}

// Every entry the sections hold, one at a time: visit({ section, file, data, body }).
// A list item's file is "path#index"; a body is "" for data files.
function eachEntry(visit) {
  const files = media.textFiles();
  const byPath = new Map(files.map((f) => [site.rel(f.full), f.text]));
  for (const section of loadConfig().sections) {
    if (!section.path) continue;
    try {
      if (section.store === "list") {
        const text = byPath.get(section.path);
        if (text == null) continue;
        listfile.readList(section.path).items.forEach((item, i) => item && typeof item === "object" && visit({ section, file: `${section.path}#${i}`, data: item, body: "" }));
      } else if (section.kind === "collection") {
        for (const [file, text] of byPath) {
          if (!file.startsWith(section.path.replace(/\/$/, "") + "/") || !/\.md$/i.test(file) || /(^|\/)readme\.md$/i.test(file)) continue;
          const { data, body } = parseMarkdown(text);
          visit({ section, file, data, body });
        }
      } else if (byPath.has(section.path)) {
        const text = byPath.get(section.path);
        if (/\.md$/i.test(section.path)) { const { data, body } = parseMarkdown(text); visit({ section, file: section.path, data, body }); }
        else if (/\.json$/i.test(section.path)) visit({ section, file: section.path, data: JSON.parse(text), body: "" });
        else if (/\.ya?ml$/i.test(section.path)) visit({ section, file: section.path, data: yaml.load(text, { schema: yaml.CORE_SCHEMA }) || {}, body: "" });
      }
    } catch { /* a file that can't be read is skipped */ }
  }
}

// what a result row needs to say about an entry
const describe = (section, file, data) => ({
  file, section: section.kind === "collection" ? section.name : null, sectionLabel: section.label,
  title: String(data[section.primary] ?? data.title ?? path.basename(file).replace(/\.\w+$/, "")),
});

function missingAlt() {
  const results = [];
  eachEntry(({ section, file, data, body }) => {
    const altDeclared = JSON.stringify(section.fields || []).includes('"name":"alt"');
    const pics = [...missingInData(data, altDeclared), ...missingInMarkdown(body)];
    if (pics.length) results.push({ ...describe(section, file, data), pictures: [...new Set(pics)] });
  });
  return results;
}

function writing() {
  const results = [];
  eachEntry(({ section, file, data, body }) => {
    const issues = textIssues(data, body);
    if (issues.length) results.push({ ...describe(section, file, data), issues });
  });
  return results;
}

function run() {
  return { unused: media.unusedImages(), missingAlt: missingAlt(), writing: writing() };
}

// Put right one kind of slip ("marks" or "spaces") in some entries (all that have it, when none are
// named). Returns what each entry said before, so it can be put back. The caller saves each entry.
function fixWriting(kind, files, entries) {
  if (kind !== "marks" && kind !== "spaces") throw Object.assign(new Error("Unknown check: " + kind), { status: 400 });
  const wanted = new Set(files && files.length ? files : writing().filter((w) => w.issues.some((i) => i.kind === kind)).map((w) => w.file));
  const done = [];
  for (const file of wanted) {
    const before = entries.readEntry(file);
    const fixed = fixEntry(kind, before.data, before.body);
    if (!fixed.changed) continue;
    entries.writeEntry(file, fixed.data, fixed.body, before.version);
    done.push({ file, data: before.data, body: before.body });
  }
  return done;
}

function putBack(items, entries) {
  for (const it of items) entries.writeEntry(it.file, it.data, it.body);
  return items.length;
}

module.exports = { fixWriting, putBack, run, missingAlt, missingInData, missingInMarkdown, writing, eachEntry };
