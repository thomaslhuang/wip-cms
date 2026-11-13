// Slips marked in the writing box with a red dotted underline, as in Word: a double space, or a
// formatting mark (** __ ~~) that never turned into formatting. Click one to see the fix and apply it.
//
// Nothing is added to the text: the underline is drawn on a layer above the page, so
// the box's content, ⌘Z and the saved Markdown are untouched. (Settings → Mark slips as you write.)
import { h } from "./util.js";
import { t } from "./i18n.js";
import { slipMarks } from "./settings.js";

const boxes = new Map();   // box -> [{ range, fix, label, what }]

// The underline is drawn on a layer above the page, not on the text, so the browser's own
// spelling underlines are left alone (and nothing is added to the box's content).
const layer = h("div", { class: "slip-layer", "aria-hidden": "true" });
document.body.append(layer);
let queued = false;
function paint() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const marks = [];
    for (const [box, slips] of boxes) {
      if (!box.isConnected) { boxes.delete(box); continue; }
      const view = box.closest(".doc-body, .doc, #docpane")?.getBoundingClientRect() || { top: 0, bottom: innerHeight };
      for (const s of slips) for (const q of s.range.getClientRects()) {
        if (q.width < 1 || q.bottom < view.top || q.top > view.bottom || q.bottom < 0 || q.top > innerHeight) continue;
        marks.push(h("i", { style: { left: q.left + "px", top: q.bottom - 2 + "px", width: q.width + "px" } }));
      }
    }
    layer.replaceChildren(...marks);
  });
}
addEventListener("scroll", paint, true);
addEventListener("resize", paint);

function scan(box) {
  const out = [];
  if (!slipMarks()) return out;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest("code, pre") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let node; (node = walker.nextNode());) {
    const text = node.data;
    for (const m of text.matchAll(/[^\s][  ]{2,}(?=[^\s])/g)) {
      // the writing box keeps every space as typed (styles.css), so the extra ones are marked as they are
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
  let timer = null;
  const refresh = () => { boxes.set(box, scan(box)); paint(); };
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { if (!box.isConnected) { boxes.delete(box); paint(); return; } refresh(); }, 500); };
  box.addEventListener("input", later);
  box.addEventListener("blur", later);
  new ResizeObserver(paint).observe(box);
  // a click on an underlined slip offers the fix
  box.addEventListener("click", (e) => {
    const slips = boxes.get(box) || [];
    const hit = slips.find((s) => [...s.range.getClientRects()].some((q) => e.clientX >= q.left - 1 && e.clientX <= q.right + 1 && e.clientY >= q.top && e.clientY <= q.bottom));
    if (hit) showFix(box, hit);
  });
  later();
}
