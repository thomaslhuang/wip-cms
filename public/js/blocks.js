// The content blocks of a post or project (text, image, carousel, collage...), laid out
// like a document: what you write and the photos, in order, without boxes around them.
//
//   - click a block to select it: its options (caption position, alt text...) and a
//     small bar (move up / down, delete) appear; click elsewhere or press Esc to put them away
//   - hover between two blocks for a + that inserts a block there
//   - drag a block by its handle (⠿, left of the block) to move it: a copy follows the pointer
//     and a blue line shows where it will land
//   - "Rearrange" (toolbar) shrinks every block to one line you can drag
//   - files dropped onto the post become blocks (app.js asks via root.api.addFiles)
//   - deleting only asks first when the block has something in it
//   - there's one "image" choice: pick or upload one picture or several; each extra one
//     becomes its own image block after it. (A "multi-upload" block in .pages.yml, kept for
//     Pages CMS, isn't offered here: image does the same.)
//   - an image with "aside next" on sits beside the image after it, as on the site
//   - carousels show as a strip you scroll sideways, collages in the site's staggered layout
//
// The toolbar (app.js) drives it through root.api: insert(), addPhotos(), toggleRearrange().
import { h, fill, icon, firstWords, confirmBox } from "./util.js";
import { renderFields } from "./fields.js";
import { openPicker, uploadAny } from "./media.js";
import { ghost, autoScroll } from "./drag.js";
import { t as tr, t2 } from "./i18n.js";

// options that only show while a block is selected
const isSecondary = (f) => ["boolean", "select", "number"].includes(f.type) || f.name === "alt";
const TYPE_ICONS = { text: "text", image: "image", photos: "images", "multi-upload": "images", carousel: "carousel", collage: "grid", html: "code" };

export function renderBlocks(field, list, ctx) {
  const key = field.blockKey || "type";
  const defs = field.blocks || [];
  const defOf = (b) => defs.find((d) => d.name === b?.[key]);
  const labelOf = (b) => tr(defOf(b)?.label || b?.[key] || "block");

  let rearranging = false;
  let selected = null;                 // the selected block (one of list)
  let choosing = null;                 // index where the "insert a block" menu is showing
  const listeners = new Set();
  const changedState = () => listeners.forEach((fn) => fn());

  const root = h("div", { class: "blocks" });
  const listEl = h("div", { class: "block-list" });

  // ----- selecting -----
  function select(b) {
    if (selected === b) return;
    selected = b;
    listEl.querySelectorAll(".block").forEach((el) => el.classList.toggle("selected", el.blockRef === b));
  }
  root.addEventListener("pointerdown", (e) => {
    if (rearranging) return;
    const el = e.target.closest(".block");
    if (el?.blockRef) select(el.blockRef);
    else if (!e.target.closest(".chooser")) select(null);
  });
  root.addEventListener("focusin", (e) => { const el = e.target.closest(".block"); if (el?.blockRef) select(el.blockRef); });
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") { select(null); if (choosing !== null) { choosing = null; draw(); } document.activeElement?.blur(); } });

  // ----- adding -----
  function newBlock(def) {
    const b = { [key]: def.name };
    for (const f of def.fields || []) if (f.default !== undefined) b[f.name] = f.default;
    return b;
  }
  const insertIndex = () => (selected && list.includes(selected) ? list.indexOf(selected) + 1 : list.length);

  async function choose(def, at) {
    choosing = null;
    if (isMulti(def)) {
      // pick or upload many photos, get one Image block each
      const urls = await openPicker({ multiple: true, folder: ctx.imageFolder });
      if (urls && urls.length) {
        const imageDef = defs.find((d) => d.name === "image");
        const made = urls.map((url) => ({ ...(imageDef ? newBlock(imageDef) : { [key]: "image" }), image: url }));
        list.splice(at, 0, ...made);
        selected = made[made.length - 1];
        ctx.changed();
      }
      return draw();
    }
    const b = newBlock(def);
    list.splice(at, 0, b);
    selected = b;
    ctx.changed();
    draw();
    // put the cursor in the new block
    requestAnimationFrame(() => {
      const el = [...listEl.querySelectorAll(".block")].find((c) => c.blockRef === b);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el?.querySelector(".rich-box:not([hidden]), textarea:not([hidden]), input")?.focus();
    });
  }
  // the multi-upload block type: hidden when there's an image block, which does the same
  const isMulti = (d) => d.name === "photos" || d.name === "multi-upload";
  const imageDef = () => defs.find((d) => d.name === "image");
  const offered = () => defs.filter((d) => !(isMulti(d) && imageDef()));

  function chooser(at) {
    return h("div", { class: "chooser", role: "menu" },
      h("div", { class: "chooser-head" }, h("span", {}, tr("Insert")),
        h("button", { class: "icon-btn", "aria-label": tr("Cancel"), onclick: () => { choosing = null; draw(); } }, icon("x"))),
      h("div", { class: "chooser-options" }, offered().map((d) =>
        h("button", { class: "chooser-option", role: "menuitem", onclick: () => choose(d, at) }, icon(TYPE_ICONS[d.name] || "plus"), tr(d.label || d.name)))));
  }
  function openChooser(at) {
    if (rearranging) toggleRearrange();
    choosing = at;
    draw();
    requestAnimationFrame(() => listEl.querySelector(".chooser")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  // ----- moving and deleting -----
  const hasContent = (b) => Object.entries(b).some(([k, v]) => {
    if (k === key || k === "layout" || k === "pair" || k === "seconds") return false;
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : false;
  });
  async function remove(b) {
    if (hasContent(b) && !(await confirmBox(tr("Delete this {type} block?", { type: labelOf(b).toLowerCase() }), tr("Delete")))) return;
    const i = list.indexOf(b);
    list.splice(i, 1);
    if (selected === b) selected = null;
    ctx.changed();
    draw();
  }
  function move(b, by) {
    const i = list.indexOf(b), j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    ctx.changed();
    draw();
    requestAnimationFrame(() => [...listEl.querySelectorAll(".block")].find((c) => c.blockRef === b)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  // ----- images side by side ("aside next") -----
  // the same rule as the site (lib/blocks.js): an image with pair on, followed by another
  // image, makes a row of two
  const pairsWith = (i) => list[i]?.[key] === "image" && list[i].pair && list[i + 1]?.[key] === "image";
  const layoutKey = () => list.map((b, i) => (pairsWith(i) ? "p" : "-")).join("");
  let drawnLayout = "";
  // a change that pairs or unpairs images redraws, so they move next to each other straight away
  const blockCtx = { ...ctx, changed: () => { ctx.changed(); if (layoutKey() !== drawnLayout) draw(); } };

  // ----- one block -----
  const previewOf = (b) => firstWords(b.text || b.caption || b.alt || "", 8) || (Array.isArray(b.images) ? t2(b.images.length, "{n} photo", "{n} photos") : tr("empty"));

  function blockEl(b, i) {
    const def = defOf(b);
    if (rearranging) {
      const el = h("div", { class: "block compact" },
        h("button", { class: "grip", "aria-label": tr("Drag to move"), onpointerdown: (e) => startDrag(e, el) }, icon("grip")),
        h("span", { class: "block-type" }, icon(TYPE_ICONS[b[key]] || "text"), labelOf(b)),
        h("span", { class: "block-preview" }, previewOf(b)),
        h("button", { class: "icon-btn", "aria-label": tr("Delete block"), onclick: () => remove(b) }, icon("x")));
      el.blockRef = b;
      return el;
    }
    let body;
    if (def) {
      // an image block that gets several pictures keeps the first and adds a block for each other one
      const fieldCtx = b[key] === "image" ? { ...blockCtx, splitImages: (urls) => {
        const at = list.indexOf(b) + 1;
        const made = urls.map((url) => ({ ...newBlock(def), image: url }));
        list.splice(at, 0, ...made);
        selected = made[made.length - 1];
        draw();
      } } : blockCtx;
      body = renderFields(def.fields || [], b, fieldCtx);
      // mark the options that only show while selected, and give the main fields placeholders
      for (const fieldEl of body.children) {
        const f = (def.fields || []).find((x) => x.name === fieldEl.dataset.name);
        if (!f) continue;
        if (isSecondary(f)) fieldEl.classList.add("secondary");
        else {
          fieldEl.classList.add("primary");
          const t = fieldEl.querySelector(":scope > textarea, :scope > input");
          if (t && !t.placeholder) t.placeholder = tr("Add {label}", { label: tr(String(f.label || f.name)).toLowerCase() });
        }
      }
    } else body = h("p", { class: "muted" }, tr("Unknown block type “{type}”", { type: b[key] }));
    const el = h("div", { class: "block block-" + b[key] + (selected === b ? " selected" : "") },
      h("button", { class: "block-grip", "aria-label": tr("Drag to move"), title: tr("Drag to move"), onpointerdown: (e) => dragBlock(e, b) }, icon("grip")),
      h("div", { class: "block-bar" },
        h("span", { class: "block-type" }, icon(TYPE_ICONS[b[key]] || "text"), labelOf(b)),
        h("button", { class: "icon-btn", "aria-label": tr("Move up"), disabled: i === 0, onclick: () => move(b, -1) }, icon("up")),
        h("button", { class: "icon-btn", "aria-label": tr("Move down"), disabled: i === list.length - 1, onclick: () => move(b, 1) }, icon("down")),
        h("button", { class: "icon-btn danger", "aria-label": tr("Delete block"), onclick: () => remove(b) }, icon("trash"))),
      h("div", { class: "block-body" }, body),
      kindNote(b));
    el.blockRef = b;
    return el;
  }
  // a line under carousels and collages saying which is which, even when not selected
  function kindNote(b) {
    if (b[key] === "carousel") return h("div", { class: "carousel-note" }, icon("carousel"), tr("carousel · one at a time, changes every {s} seconds", { s: b.seconds || 3 }));
    if (b[key] === "collage") return h("div", { class: "carousel-note" }, icon("grid"), tr("collage · all at once, staggered"));
    return null;
  }
  const insertLine = (at) => h("div", { class: "insert-line" },
    h("button", { "aria-label": tr("Insert a block here"), title: tr("Insert a block here"), onclick: () => openChooser(at) }, icon("plus")));

  // ----- drag a block by its handle -----
  // the blocks (and pairs of side-by-side images) as they sit on the page, with their place in the list
  const units = () => [...listEl.children].filter((c) => c.classList.contains("block") || c.classList.contains("block-pair"))
    .map((c) => ({ el: c, index: list.indexOf((c.blockRef ? c : c.querySelector(".block")).blockRef) }));
  // where a block dropped at height y would go, and the line that shows it
  const dropLine = h("div", { class: "drop-line", hidden: true });
  function dropIndexAt(y) {
    const all = units();
    for (const u of all) {
      const r = u.el.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { index: u.index, top: u.el.offsetTop - 11 };
    }
    const lastEl = all[all.length - 1]?.el;
    return { index: list.length, top: lastEl ? lastEl.offsetTop + lastEl.offsetHeight + 11 : 0 };
  }
  function showDropAt(y) {
    const { index, top } = dropIndexAt(y);
    if (!dropLine.isConnected) listEl.append(dropLine);
    dropLine.hidden = false;
    dropLine.style.top = top + "px";
    return index;
  }
  const hideDrop = () => { dropLine.hidden = true; };

  // The block itself moves as you drag (a copy also follows the pointer), so you see the
  // post as it will be. It only moves when it would really change place.
  function dragBlock(e, b) {
    if (e.button > 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false, copy = null, scroller = null, last = e, src = null;
    const isUnit = (c) => c.classList.contains("block") || c.classList.contains("block-pair");
    const begin = () => {
      dragging = true;
      select(null);
      src = [...listEl.querySelectorAll(".block")].find((c) => c.blockRef === b);
      // a block that was beside another image comes out of the pair while it moves
      if (src.parentNode !== listEl) listEl.insertBefore(src, src.parentNode);
      copy = ghost(h("div", { class: "block-ghost" }, icon(TYPE_ICONS[b[key]] || "text"), h("b", {}, labelOf(b)), h("span", {}, previewOf(b))), 260, last, { x: 20, y: 18 });
      src.classList.add("drag-source");
      root.classList.add("block-dragging");
      scroller = autoScroll([root.closest(".docpane")], () => place(last));
    };
    // before the first other block whose middle is below the pointer; nothing happens
    // while that's where it already is
    const place = (ev) => {
      const others = [...listEl.children].filter((c) => isUnit(c) && c !== src);
      const before = others.find((u) => { const r = u.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }) || null;
      let next = src.nextElementSibling;
      while (next && !isUnit(next)) next = next.nextElementSibling;
      if (next === before) return;
      if (before) listEl.insertBefore(src, before);
      else listEl.append(src);
    };
    const move = (ev) => {
      last = ev;
      if (!dragging) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return; begin(); }
      ev.preventDefault();
      copy.move(ev);
      scroller.at(ev);
      place(ev);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!dragging) { select(b); return; }
      copy.remove(); scroller.stop();
      root.classList.remove("block-dragging");
      // the new order is the order on the page
      const order = [...listEl.querySelectorAll(".block")].map((c) => c.blockRef).filter(Boolean);
      if (order.length === list.length && order.some((x, k) => x !== list[k])) { list.splice(0, list.length, ...order); ctx.changed(); }
      selected = b;
      draw();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // ----- files dropped onto the post -----
  // pictures become image blocks, videos video blocks (HTML), anything else a link in a text block
  async function addFiles(files, at = list.length) {
    const made = [];
    const imageDef = defs.find((d) => d.name === "image");
    const textDef = defs.find((d) => d.name === "text");
    const htmlDef = defs.find((d) => d.name === "html");
    for (const f of await uploadAny(ctx.imageFolder, files)) {
      if (f.kind === "image" && imageDef) made.push({ ...newBlock(imageDef), image: f.url });
      else if (f.kind === "video" && htmlDef) made.push({ ...newBlock(htmlDef), html: `<video src="${f.url}" controls playsinline preload="metadata"></video>` });
      else if (textDef) made.push({ ...newBlock(textDef), text: `[${f.name.replace(/[[\]]/g, "")}](${f.url})` });
    }
    if (!made.length) return;
    list.splice(at, 0, ...made);
    selected = made[made.length - 1];
    ctx.changed();
    draw();
  }

  // ----- drag to reorder (Rearrange) -----
  function startDrag(e, el) {
    e.preventDefault();
    // listen on the whole window: moving the block in the page would otherwise lose the pointer
    el.classList.add("dragging");
    const move = (ev) => {
      const siblings = [...listEl.children].filter((c) => c !== el && c.blockRef);
      const after = siblings.find((c) => { const r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (after) { if (el.nextSibling !== after) listEl.insertBefore(el, after); }
      else if (listEl.lastElementChild !== el) listEl.append(el);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      el.classList.remove("dragging");
      const order = [...listEl.children].map((c) => c.blockRef).filter(Boolean);
      if (order.some((b, i) => b !== list[i])) { list.splice(0, list.length, ...order); ctx.changed(); }
      draw();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function toggleRearrange() {
    rearranging = !rearranging;
    choosing = null;
    draw();
    changedState();
  }

  // ----- draw everything -----
  function draw() {
    root.classList.toggle("rearranging", rearranging);
    const items = [];
    drawnLayout = layoutKey();
    for (let i = 0; i < list.length; i++) {
      if (choosing === i) items.push(chooser(i));
      else if (!rearranging) items.push(insertLine(i));
      if (!rearranging && pairsWith(i)) {
        items.push(h("div", { class: "block-pair" }, blockEl(list[i], i), blockEl(list[i + 1], i + 1)));
        i++;
      } else items.push(blockEl(list[i], i));
    }
    if (choosing !== null && choosing >= list.length) items.push(chooser(list.length));
    else if (!rearranging) items.push(insertLine(list.length));
    fill(listEl, items);
    if (!list.length && choosing === null) {
      listEl.prepend(h("div", { class: "blocks-empty" }, h("p", { class: "muted" }, tr("Nothing here yet.")),
        h("button", { class: "btn", onclick: () => openChooser(0) }, icon("plus"), tr("Insert a block"))));
    }
  }

  root.api = {
    insert: () => openChooser(insertIndex()),
    addPhotos: () => { const d = defs.find(isMulti) || imageDef(); if (d) choose({ ...d, name: "photos" }, insertIndex()); },
    hasPhotos: () => !!(defs.find(isMulti) || imageDef()),
    toggleRearrange,
    showDropAt, hideDrop, addFiles,
    isRearranging: () => rearranging,
    onState: (fn) => listeners.add(fn),
  };
  root.append(listEl);
  draw();
  return root;
}
