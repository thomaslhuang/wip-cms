// Colour-coded source (Markdown, HTML, CSS) in a normal text box.
//
// The text box stays a real <textarea> (so typing, undo and spell check work as usual);
// its text is made see-through and a coloured copy is drawn exactly underneath it.
// The colours are the theme's "code colours" (ayu dark or ayu light, see styles.css).
import { h } from "./util.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls, text) => `<span class="syn-${cls}">${esc(text)}</span>`;

// ---------- CSS ----------
function css(src) {
  let out = "", inBlock = 0, expectValue = false;
  const re = /\/\*[\s\S]*?(\*\/|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|r?em|%|vh|vw|s|ms|deg|fr|ch|ex|pt)?|[{}:;,()]|!important|@[\w-]+|[.#]?[\w-]+|\s+|./g;
  for (const m of src.matchAll(re)) {
    const t = m[0];
    if (t.startsWith("/*")) out += span("comment", t);
    else if (t[0] === '"' || t[0] === "'") out += span("string", t);
    else if (t === "{") { inBlock++; expectValue = false; out += span("punct", t); }
    else if (t === "}") { inBlock = Math.max(0, inBlock - 1); expectValue = false; out += span("punct", t); }
    else if (t === ":" && inBlock) { expectValue = true; out += span("punct", t); }
    else if (t === ";") { expectValue = false; out += span("punct", t); }
    else if (/^[,()]$/.test(t)) out += span("punct", t);
    else if (t === "!important" || t[0] === "@") out += span("keyword", t);
    else if (/^#[0-9a-fA-F]{3,8}$/.test(t) && (expectValue || !inBlock)) out += span(expectValue ? "constant" : "entity", t);
    else if (/^-?\d*\.?\d+/.test(t) && (expectValue || !inBlock)) {
      const [, num, unit] = /^(-?\d*\.?\d+)(.*)$/.exec(t);
      out += span("constant", num) + (unit ? span("keyword", unit) : "");
    }
    else if (/^\s+$/.test(t)) out += esc(t);
    else if (!inBlock) out += span(t[0] === "." || t[0] === "#" ? "entity" : t[0] === ":" ? "special" : "tag", t);
    else out += span(expectValue ? "fg" : "tag", t);
  }
  return out;
}

// ---------- HTML ----------
export function html(src) {
  let out = "";
  const re = /<!--[\s\S]*?(-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]+))?)*)\s*(\/?)(>?)|&[#\w]+;|[^<&]+|[<&]/g;
  let m, inStyle = false, styleStart = 0;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (inStyle) {
      // everything up to </style> is CSS
      const end = src.toLowerCase().indexOf("</style", styleStart);
      const cssText = src.slice(styleStart, end < 0 ? src.length : end);
      out += css(cssText);
      re.lastIndex = end < 0 ? src.length : end;
      inStyle = false;
      continue;
    }
    if (t.startsWith("<!--")) out += span("comment", t);
    else if (m[3]) {
      out += span("punct", "<" + m[2]) + span("tag", m[3]);
      out += (m[4] || "").replace(/(\s+)([^\s=]+)(?:(\s*=\s*)("[^"]*"?|'[^']*'?|[^\s>]+))?/g, (_, sp, name, eq, val) =>
        esc(sp) + span("attr", name) + (eq ? span("punct", eq) + span("string", val) : ""));
      out += span("punct", (m[5] || "") + (m[6] || ""));
      if (m[3].toLowerCase() === "style" && !m[2] && m[6]) { inStyle = true; styleStart = re.lastIndex; }
    }
    else if (t[0] === "&" && t.length > 1) out += span("constant", t);
    else out += span("fg", t);
  }
  return out;
}

// ---------- Markdown (with HTML inside it) ----------
function inlineMd(line) {
  let out = "";
  const re = /(<\/?[a-zA-Z][^>]*>?|<!--[\s\S]*?-->)|(`[^`]*`?)|(!?\[)([^\]]*)(\]\()([^)]*)(\)?)|(\*\*|__|\*|_)|(\\.)|(&[#\w]+;)|([^<`!\[*_\\&]+|.)/g;
  for (const m of line.matchAll(re)) {
    if (m[1]) out += html(m[1]);
    else if (m[2]) out += span("regexp", m[2]);
    else if (m[3]) out += span("punct", m[3]) + span("entity", m[4]) + span("punct", m[5]) + span("string", m[6]) + span("punct", m[7] || "");
    else if (m[8]) out += span("special", m[8]);
    else if (m[9]) out += span("operator", m[9]);
    else if (m[10]) out += span("constant", m[10]);
    else out += span("fg", m[0]);
  }
  return out;
}
export function markdown(src) {
  return src.split("\n").map((line) => {
    let m;
    if ((m = /^(\s{0,3}#{1,6}\s)(.*)$/.exec(line))) return span("markup", m[1]) + `<span class="syn-markup">${inlineMd(m[2])}</span>`;
    if ((m = /^(\s*)([-*+]|\d+[.)])(\s.*)$/.exec(line))) return esc(m[1]) + span("keyword", m[2]) + inlineMd(m[3]);
    if ((m = /^(\s*>+)(.*)$/.exec(line))) return span("comment", m[1]) + inlineMd(m[2]);
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) return span("comment", line);
    return inlineMd(line);
  }).join("\n");
}

// Colour a textarea's text. lang: "markdown" | "html". Returns the wrapper to put in the page.
export function codeArea(textarea, lang = "markdown") {
  const layer = h("pre", { class: "code-layer", "aria-hidden": "true" });
  const wrap = h("div", { class: "code-wrap" }, layer, textarea);
  textarea.classList.add("code-input");
  textarea.spellcheck = lang === "markdown";
  const paint = () => {
    const cs = getComputedStyle(textarea);
    for (const p of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "fontFamily", "fontSize", "lineHeight", "letterSpacing", "tabSize"]) layer.style[p] = cs[p];
    layer.innerHTML = (lang === "html" ? html : markdown)(textarea.value) + "\n ";
  };
  textarea.addEventListener("input", paint);
  textarea.addEventListener("scroll", () => { layer.scrollTop = textarea.scrollTop; });
  new ResizeObserver(paint).observe(textarea);
  requestAnimationFrame(paint);
  wrap.repaint = paint;
  return wrap;
}
