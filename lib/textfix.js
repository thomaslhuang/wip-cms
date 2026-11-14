// Fixes for the slips lib/textcheck.js finds, so Check content can put them right without opening
// each item:
//   spaces   two or more spaces in a row become one (code, indentation and Markdown's two-space line
//            break are left alone)
//   marks    a stray ** / __ / ~~ goes. If it is a pair that just has a space on the wrong side
//            ("**Kim **The"), the space moves instead and the bold is kept ("**Kim** The").
// Applied to a post's body and to every text value in its fields, the same ones textcheck looks at.
const MarkdownIt = require("markdown-it");
const md = new MarkdownIt({ html: true, linkify: false });

const looksLikeAddress = (v) => /^(\/|\.\/|https?:|mailto:|tel:|#)/.test(v) || /^[\w./%~-]+\.[a-z0-9]{2,5}([?#]\S*)?$/i.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v);

function fixSpaces(text, block) {
  let fence = false;
  return String(text).split("\n").map((line) => {
    if (block && /^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence || (block && /^( {4}|\t)/.test(line))) return line;
    const parts = line.split(/(`[^`]*`)/);   // code spans stay as they are
    return parts.map((p, i) => i % 2 ? p : p.replace(/(\S)[  ]{2,}(?=\S)/g, "$1 ")).join("");
  }).join("\n");
}

// how many marks are left showing, and how many bold/italic/strike runs there are
function measure(text, inline) {
  const html = inline ? md.renderInline(text) : md.render(text);
  const shown = html.replace(/<(pre|code|script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return {
    stray: (shown.match(/\*\*|__|~~/g) || []).length,
    runs: (html.match(/<(strong|em|del|s)\b/g) || []).length,
  };
}

function fixMarks(text, inline) {
  let out = String(text);
  for (let guard = 0; guard < 40; guard++) {
    const now = measure(out, inline);
    if (!now.stray) break;
    const found = [...out.matchAll(/\*\*|__|~~/g)];
    let next = null;
    // 1) a pair with a space on the wrong side: move the space outside the marks
    for (const m of found) {
      const mark = m[0];
      const trailing = out.slice(0, m.index).match(/(\s+)$/);
      const tail = out.slice(m.index + mark.length);
      if (!trailing || !/^\S/.test(tail)) continue;   // a closing mark: space before it, text right after
      const candidate = out.slice(0, m.index - trailing[1].length) + mark + trailing[1] + tail;
      const after = measure(candidate, inline);
      if (after.runs > now.runs && after.stray < now.stray) { next = candidate; break; }
    }
    // 2) otherwise take the first mark away that is only a stray one
    if (!next) for (const m of found) {
      const candidate = out.slice(0, m.index) + out.slice(m.index + m[0].length);
      const after = measure(candidate, inline);
      if (after.stray < now.stray && after.runs === now.runs) { next = candidate; break; }
    }
    if (!next || next === out) break;
    out = next;
  }
  return out;
}

const fixers = { spaces: fixSpaces, marks: (t, block) => fixMarks(t, !block) };

// fix one kind of slip in an entry's data and body; -> { data, body, changed }
function fixEntry(kind, data, body) {
  const fix = fixers[kind];
  let changed = false;
  const walk = (node, depth = 0) => {
    if (depth > 8) return node;
    if (typeof node === "string") {
      if (!node.trim() || looksLikeAddress(node.trim())) return node;
      const next = fix(node, false);
      if (next !== node) changed = true;
      return next;
    }
    if (Array.isArray(node)) return node.map((v) => walk(v, depth + 1));
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, depth + 1)]));
    return node;
  };
  const newData = walk(data || {});
  let newBody = body || "";
  if (newBody.trim()) { const next = fix(newBody, true); if (next !== newBody) { newBody = next; changed = true; } }
  return { data: newData, body: newBody, changed };
}

module.exports = { fixEntry, fixSpaces, fixMarks };
