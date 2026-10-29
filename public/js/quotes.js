// Typographer's quotes (Settings → Use typographer's quotes), as in InDesign: typing " or '
// puts in “ ” or ‘ ’ instead, and an apostrophe inside a word (don't) becomes ’.
//
// Which one: after a space, the start of the text, or an opening bracket or dash, it's an
// opening quote; anywhere else it's a closing quote (or an apostrophe).
// Left alone: Source view, HTML and code fields, and anything that looks like a web address
// or a permalink, where straight quotes may be needed. ⌘Z undoes it like any typing.
import { smartQuotes } from "./settings.js";

const OPENS_AFTER = /[\s([{<“‘—–\-/]/;
const curly = (ch, before) => {
  const opening = !before || OPENS_AFTER.test(before);
  if (ch === '"') return opening ? "“" : "”";
  return opening ? "‘" : "’";
};

// where quotes are left as typed
function skip(el) {
  if (el.closest(".code-wrap, .field-code, .permalink, .meta-tag-input, .set-input, .search-input, .add-dialog, .custom-dialog, .settings-dialog")) return true;
  if (el.matches("textarea.source, textarea.code, .permalink-input, input[type=url], input[type=search], input[type=number]")) return true;
  if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && /^(\/|https?:|www\.)/.test(el.value.trim())) return true;
  return false;
}

export function installQuotes() {
  document.addEventListener("beforeinput", (e) => {
    if (e.inputType !== "insertText" || (e.data !== '"' && e.data !== "'") || !smartQuotes()) return;
    const el = e.target;
    if (!(el instanceof HTMLElement) || skip(el)) return;
    if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type === "text")) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value } = el;
      el.setRangeText(curly(e.data, value[s - 1]), s, end, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const box = el.isContentEditable ? el : null;
    if (!box) return;
    const sel = getSelection();
    if (!sel.rangeCount) return;
    // the character just before the caret, within this text box
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    const pre = document.createRange();
    pre.selectNodeContents(box);
    pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString().slice(-1);
    e.preventDefault();
    document.execCommand("insertText", false, curly(e.data, before));
  }, true);
}
