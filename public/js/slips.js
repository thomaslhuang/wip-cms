// Slips marked in the writing box with a red wavy underline, as in Word: a double space, or a
// formatting mark (** __ ~~) that never turned into formatting. Click one to see the fix and apply it.
//
// Nothing is added to the text: the underline is drawn with the browser's Custom Highlight API, so
// the box's content, ⌘Z and the saved Markdown are untouched. (Settings → Mark slips as you write.)
import { h } from "./util.js";
import { t } from "./i18n.js";
import { slipMarks } from "./settings.js";

const supported = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
const boxes = new Map();   // box -> [{ range, fix, label }]

function paint() {
  if (!supported) return;
  const all = [];
  for (const slips of boxes.values()) for (const s of slips) all.push(s.range);
  if (all.length) CSS.highlights.set("wip-slip", new Highlight(...all)); else CSS.highlights.delete("wip-slip");
}

function scan(box) {
  const out = [];
  if (!slipMarks()) return out;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest("code, pre") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let node; (node = walker.nextNode());) {
    const text = node.data;
    for (const m of text.matchAll(/[^\s][  ]{2,}(?=[^\s])/g)) {
      const range = document.createRange();
      range.setStart(node, m.index + 1); range.setEnd(node, m.index + m[0].length);
      out.push({ range, fix: " ", label: t("Remove the extra space"), what: t("Double space") });
    }
    for (const m of text.matchAll(/\*\*|__|~~/g)) {
      const range = document.createRange();
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      out.push({ range, fix: "", label: t("Remove {mark}", { mark: m[0] }), what: t("Stray formatting mark") });
    }
  }
  return out;
}

let pop = null;
const closePop = () => { pop?.remove(); pop = null; };

function showFix(box, slip) {
  closePop();
  const r = slip.range.getBoundingClientRect();
  const apply = () => {
    closePop();
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(slip.range);
    box.focus();
    // typed in as text, so ⌘Z undoes it and the box saves it like any edit
    if (slip.fix) document.execCommand("insertText", false, slip.fix); else document.execCommand("delete");
  };
  pop = h("div", { class: "slip-pop", role: "dialog", "aria-label": slip.what, style: { left: Math.max(8, r.left) + "px", top: r.bottom + 6 + "px" } },
    h("span", { class: "slip-what" }, slip.what),
    h("button", { class: "btn small primary", onclick: apply }, slip.label));
  document.body.append(pop);
  pop.querySelector("button").focus();
}

document.addEventListener("mousedown", (e) => { if (pop && !pop.contains(e.target)) closePop(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); }, true);

export function watchSlips(box) {
  if (!supported) return;
  let timer = null;
  const refresh = () => { boxes.set(box, scan(box)); paint(); };
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { if (!box.isConnected) { boxes.delete(box); paint(); return; } refresh(); }, 500); };
  box.addEventListener("input", later);
  box.addEventListener("blur", later);
  // a click on an underlined slip offers the fix
  box.addEventListener("click", (e) => {
    const slips = boxes.get(box) || [];
    const hit = slips.find((s) => [...s.range.getClientRects()].some((q) => e.clientX >= q.left - 1 && e.clientX <= q.right + 1 && e.clientY >= q.top && e.clientY <= q.bottom));
    if (hit) showFix(box, hit);
  });
  later();
}
