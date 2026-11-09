// Writing with the formatting showing: *italic* looks italic, **bold** looks bold, links
// look like links, and your text is still saved as Markdown, exactly as the site expects.
//
// How: the Markdown is turned into HTML for the writing box (with markdown-it, set up like
// the site's lib/blocks.js), and when you type, the box's HTML is turned back into Markdown
// (toMarkdown below). Text you don't touch keeps its Markdown as it was.
//
// Typing *word* or **word** formats it as you go. ⌘B / ⌘I work too. Pasting pastes plain text, except:
//   - "/" on an empty line calls onSlash (the block menu)
//   - a picture on the clipboard (a screenshot, a copied file) goes to onPasteFiles, if there is one
//   - a web address pasted over selected text makes that text a link
// The link button opens a box that can search your own posts and pages (js/linkpicker.js).
import { h } from "./util.js";
import { t as tr } from "./i18n.js";
import { pickLink } from "./linkpicker.js";

const md = () => (window.markdownit ? window.markdownit({ html: true }) : null);

// ---------- HTML -> Markdown ----------

const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "BLOCKQUOTE", "PRE", "HR", "TABLE", "FIGURE"]);

function escapeText(text, keepNbsp) {
  let t = text.replace(/​/g, "");
  if (!keepNbsp) t = t.replace(/ /g, " ");
  return t
    .replace(/\\/g, "\\\\")
    .replace(/([*`])/g, "\\$1")
    .replace(/(^|[\s(])_/g, "$1\\_").replace(/_(?=$|[\s).,!?:;])/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/<(?=[a-zA-Z/!])/g, "&lt;");
}

// outside spaces go outside the ** or *, or Markdown won't see them as formatting
function wrapMarks(inner, mark) {
  if (!inner.trim()) return inner;
  const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
  return lead + mark + inner.trim() + mark + trail;
}

const attrs = (el) => [...el.attributes].map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join("");

function inline(node, opts) {
  let out = "";
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      // the newline the Markdown had after a line break is already part of the break
      const text = n.previousSibling?.nodeName === "BR" ? n.nodeValue.replace(/^\n/, "") : n.nodeValue;
      out += escapeText(text, opts.keepNbsp);
      continue;
    }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (tag === "BR") {
      // a line break at the very end of a paragraph is just the browser's placeholder
      if (n.nextSibling || n.parentNode !== opts.root) out += n.nextSibling ? "\\\n" : "";
      continue;
    }
    if (tag === "STRONG" || tag === "B") out += wrapMarks(inline(n, opts), "**");
    else if (tag === "EM" || tag === "I") out += wrapMarks(inline(n, opts), "*");
    else if (tag === "CODE") out += "`" + n.textContent + "`";
    else if (tag === "A") out += `[${inline(n, opts)}](${n.getAttribute("href") || ""}${n.title ? ` "${n.title}"` : ""})`;
    else if (tag === "IMG") out += `![${n.getAttribute("alt") || ""}](${n.getAttribute("src") || ""}${n.title ? ` "${n.title}"` : ""})`;
    else if ((tag === "SPAN" || tag === "FONT") && (!n.attributes.length || n.hasAttribute("style") && n.attributes.length === 1)) out += inline(n, opts);
    else out += `<${tag.toLowerCase()}${attrs(n)}>${inline(n, opts)}</${tag.toLowerCase()}>`;  // anything else stays as HTML
  }
  return out;
}

// a paragraph starting with "- ", "1. ", "# " or "> " would turn into a list, heading or quote
const escapeStarts = (t) => t.replace(/(^|\n)(\s*)([-+*]|\d+[.)]|#{1,6}|>)(?=\s|$)/g, (m, nl, sp, mark) => nl + sp + (/^\d/.test(mark) ? mark.replace(/([.)])$/, "\\$1") : "\\" + mark));

function blocks(root, opts, depth = 0) {
  const parts = [];
  let loose = null; // text and inline elements sitting directly in the box (no paragraph around them)
  const flush = () => { if (loose) { const t = escapeStarts(inline(loose, { ...opts, root: loose }).trim()); if (t) parts.push(t); loose = null; } };
  for (const n of [...root.childNodes]) {
    if (n.nodeType === 1 && BLOCKS.has(n.tagName)) {
      flush();
      const tag = n.tagName;
      if (tag === "P" || (tag === "DIV" && !n.attributes.length)) {
        if (tag === "DIV" && [...n.children].some((c) => BLOCKS.has(c.tagName))) parts.push(blocks(n, opts, depth));
        else { const t = escapeStarts(inline(n, { ...opts, root: n }).replace(/\s+$/, "")); if (t.trim()) parts.push(t); }
      } else if (/^H[1-6]$/.test(tag)) parts.push("#".repeat(+tag[1]) + " " + inline(n, { ...opts, root: n }).trim());
      else if (tag === "UL" || tag === "OL") {
        let k = Number(n.getAttribute("start")) || 1;
        parts.push([...n.children].filter((li) => li.tagName === "LI").map((li) => {
          const marker = tag === "OL" ? `${k++}.` : "-";
          const body = [...li.childNodes].some((c) => c.nodeType === 1 && BLOCKS.has(c.tagName)) ? blocks(li, opts, depth + 1) : escapeStarts(inline(li, { ...opts, root: li }).trim());
          return marker + " " + body.replace(/\n/g, "\n" + " ".repeat(marker.length + 1));
        }).join("\n"));
      } else if (tag === "BLOCKQUOTE") parts.push(blocks(n, opts, depth + 1).split("\n").map((l) => "> " + l).join("\n"));
      else if (tag === "PRE") parts.push("```\n" + n.textContent.replace(/\n$/, "") + "\n```");
      else if (tag === "HR") parts.push("---");
      else parts.push(n.outerHTML);
    } else {
      if (n.nodeType === 1 && n.tagName === "BR" && !loose) continue;
      if (!loose) loose = document.createElement("p");
      loose.append(n.cloneNode(true));
    }
  }
  flush();
  return parts.join("\n\n");
}

export function toMarkdown(el, { inline: isInline = false, keepNbsp = false } = {}) {
  const opts = { keepNbsp, root: el };
  return isInline ? inline(el, opts).replace(/\s+$/, "") : blocks(el, opts);
}
export function toHtml(text, isInline = false) {
  const m = md();
  if (!m) return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return isInline ? m.renderInline(String(text || "")) : m.render(String(text || ""));
}

// ---------- the writing box ----------

//   value      the Markdown
//   inline     captions: one paragraph, no headings or lists
//   onChange   called with the new Markdown as you type
export function richBox({ value = "", inline: isInline = false, placeholder = "", onChange, onPasteFiles = null, onSlash = null }) {
  const keepNbsp = / /.test(value);
  const el = h("div", { class: "rich-box" + (isInline ? " inline" : ""), contenteditable: "true", role: "textbox", "aria-multiline": String(!isInline), "data-placeholder": placeholder, spellcheck: "true" });
  const setEmpty = () => el.classList.toggle("is-empty", !el.textContent.trim() && !el.querySelector("img"));
  const set = (text) => { el.innerHTML = toHtml(text, isInline); setEmpty(); };
  set(value);

  const changed = () => { setEmpty(); onChange?.(toMarkdown(el, { inline: isInline, keepNbsp })); };
  el.addEventListener("input", () => { autoFormat(); changed(); });
  el.addEventListener("focus", () => { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* old browser */ } });
  // paste as plain text, so formatting from other apps doesn't come along
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const pictures = [...(e.clipboardData.files || [])].filter((f) => /^image\//.test(f.type));
    if (pictures.length && onPasteFiles) return void onPasteFiles(pictures);
    const text = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    // an address pasted over selected words: those words become the link
    if (/^(https?:\/\/|mailto:)\S+$/i.test(text.trim()) && sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode) && el.contains(sel.focusNode)) {
      document.execCommand("createLink", false, text.trim());
      return changed();
    }
    document.execCommand("insertText", false, isInline ? text.replace(/\s*\n\s*/g, " ") : text);
  });
  el.addEventListener("keydown", (e) => {
    // ⌘B bold, ⌘I italic (Ctrl on Windows), as in any writing app
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && /^[bi]$/i.test(e.key)) {
      e.preventDefault();
      document.execCommand(e.key.toLowerCase() === "b" ? "bold" : "italic");
      changed();
      return;
    }
    // "/" on an empty line opens the block menu (see blocks.js), as in Notion
    if (e.key === "/" && onSlash && !isInline && !e.metaKey && !e.ctrlKey && !e.altKey && !el.textContent.trim()) { e.preventDefault(); onSlash(); return; }
    if (isInline && e.key === "Enter") e.preventDefault();          // captions are one line
    if (e.key === "Enter" && e.shiftKey && !isInline) { e.preventDefault(); document.execCommand("insertLineBreak"); }
  });

  // typing *word* or **word**: format it and drop the stars
  function autoFormat() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode, offset = sel.anchorOffset;
    if (!node || node.nodeType !== 3) return;
    const before = node.nodeValue.slice(0, offset);
    const m = /(^|[^*\\])(\*\*([^*\s](?:[^*]*[^*\s])?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*)$/.exec(before);
    if (!m) return;
    const bold = !!m[3], inner = m[3] || m[4];
    const start = offset - m[2].length;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, offset);
    range.deleteContents();
    const wrap = document.createElement(bold ? "strong" : "em");
    wrap.textContent = inner;
    range.insertNode(wrap);
    const after = document.createTextNode("​");
    wrap.after(after);
    const caret = document.createRange();
    caret.setStart(after, 1);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  }

  // the link button: ask where to (the box can search your pages), then link the selected words, or,
  // with nothing selected, put in a link named after the page (or the address itself)
  async function linkCommand() {
    const sel = window.getSelection();
    const inside = sel.rangeCount && el.contains(sel.anchorNode);
    const range = inside ? sel.getRangeAt(0).cloneRange() : null;
    const existing = range && (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest("a");
    const picked = await pickLink({
      rect: range ? range.getBoundingClientRect() : el.getBoundingClientRect(),
      current: existing?.getAttribute("href") || "", hasSelection: !!range && !range.collapsed, canRemove: !!existing && el.contains(existing),
    });
    el.focus();
    if (range) { sel.removeAllRanges(); sel.addRange(range); }
    if (!picked) return;
    if (picked.remove) {
      if (existing) { const r = document.createRange(); r.selectNodeContents(existing); sel.removeAllRanges(); sel.addRange(r); }
      document.execCommand("unlink");
    } else if (range && !range.collapsed) document.execCommand("createLink", false, picked.url);
    else if (existing && el.contains(existing)) existing.setAttribute("href", picked.url);
    else {
      const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      document.execCommand("insertHTML", false, `<a href="${esc(picked.url)}">${esc(picked.title || picked.url)}</a>`);
    }
    changed();
  }

  return {
    el,
    set,
    get: () => toMarkdown(el, { inline: isInline, keepNbsp }),
    command(cmd) {
      el.focus();
      if (cmd === "link") return void linkCommand();
      if (cmd === "bold" || cmd === "italic") document.execCommand(cmd);
      else if (cmd === "break") document.execCommand("insertLineBreak");
      changed();
    },
  };
}
