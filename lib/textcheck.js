// Slips in the writing itself, for the Check content page:
//   marks     formatting marks that were typed but didn't turn into formatting: a leftover **, a
//             __ or ~~, or two or more single * that never paired up. (One lone * is left alone:
//             it is usually a footnote star.)
//   spaces    two or more spaces in a row between words. (Two spaces at the very end of a line are
//             Markdown's line break, and indentation and code are left alone.)
// Looks at a post's body and at every text value in its fields.
const MarkdownIt = require("markdown-it");
const md = new MarkdownIt({ html: true, linkify: false });

const looksLikeAddress = (v) => /^(\/|\.\/|https?:|mailto:|tel:|#)/.test(v) || /^[\w./%~-]+\.[a-z0-9]{2,5}([?#]\S*)?$/i.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v);

// the text as a reader sees it, with Markdown turned into formatting: whatever formatting marks
// are still in it didn't work
function seen(text, inline) {
  const html = inline ? md.renderInline(text) : md.render(text);
  return html
    .replace(/<(pre|code|script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const excerpt = (text, i, len) => {
  const from = Math.max(0, i - 24), to = Math.min(text.length, i + len + 24);
  return (from > 0 ? "…" : "") + text.slice(from, to).replace(/\s+/g, (m) => (m.length > 1 && /^ +$/.test(m) ? "␣".repeat(m.length) : " ")).trim() + (to < text.length ? "…" : "");
};

function marksIn(text, inline) {
  const out = [];
  const shown = seen(text, inline);
  for (const m of shown.matchAll(/\*\*|__|~~/g)) { out.push(excerpt(shown, m.index, m[0].length)); if (out.length >= 3) return out; }
  const stars = [...shown.matchAll(/\*/g)];
  if (stars.length >= 2 && !out.length) out.push(excerpt(shown, stars[0].index, 1));
  return out;
}

function spacesIn(text, block) {
  const out = [];
  const lines = String(text).split("\n");
  let fence = false;
  let offset = 0;
  for (const line of lines) {
    const start = offset; offset += line.length + 1;
    if (block && /^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence || (block && /^( {4}|\t)/.test(line))) continue;
    const body = line.replace(/`[^`]*`/g, (c) => " ".repeat(c.length)).replace(/^\s+/, (s) => "x".repeat(s.length));
    for (const m of body.matchAll(/\S {2,}(?=\S)/g)) {
      out.push(excerpt(text, start + m.index, m[0].length));
      if (out.length >= 3) return out;
    }
  }
  return out;
}

// every text value in some data, with where it is: [{ field, text }]
function strings(node, field, out = [], depth = 0) {
  if (depth > 8) return out;
  if (typeof node === "string") { if (node.trim() && !looksLikeAddress(node.trim())) out.push({ field, text: node }); }
  else if (Array.isArray(node)) node.forEach((v) => strings(v, field, out, depth + 1));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) strings(v, depth ? field : k, out, depth + 1);
  return out;
}

// -> [{ kind: "marks" | "spaces", field, sample }]
function textIssues(data, body) {
  const issues = [];
  const add = (kind, field, samples) => samples.slice(0, 1).forEach((sample) => issues.push({ kind, field, sample }));
  if (body && body.trim()) { add("marks", "body", marksIn(body, false)); add("spaces", "body", spacesIn(body, true)); }
  for (const { field, text } of strings(data || {}, "")) {
    add("marks", field, marksIn(text, true));
    add("spaces", field, spacesIn(text, false));
  }
  return issues;
}

module.exports = { textIssues, marksIn, spacesIn };
