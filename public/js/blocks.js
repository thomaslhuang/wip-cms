// The list of content blocks (text, image, carousel, collage...) in a post or project.
//
// Works like the Pages CMS script we built:
//   - each block has a coloured line and label for its type, and shows its first words
//   - a small + under every block adds a new block right there
//   - "Rearrange" collapses everything and shows drag handles; "Done" puts it back
//   - deleting only asks first when the block has something in it
//   - "multi-upload" adds one Image block per picked photo, straight away
import { h, fill, icon, colourFor, firstWords, confirmBox } from "./util.js";
import { renderFields } from "./fields.js";
import { openPicker } from "./media.js";

export function renderBlocks(field, list, ctx) {
  const key = field.blockKey || "type";
  const defs = field.blocks || [];
  const defOf = (b) => defs.find((d) => d.name === b?.[key]);
  const labelOf = (b) => (defOf(b)?.label || b?.[key] || "block");

  const open = new WeakMap();          // block -> open? (new and existing blocks start open)
  const isOpen = (b) => open.get(b) !== false;
  let rearranging = false;
  let openBefore = null;               // which blocks were open when Rearrange was pressed
  let choosing = null;                 // index where a "choose a block type" row is showing

  const root = h("div", { class: "blocks" });
  const listEl = h("div", { class: "block-list" });

  // ----- the sticky bar -----
  const rearrangeBtn = h("button", { class: "bar-btn", onclick: () => toggleRearrange() }, icon("arrows"), h("span", { class: "fixed-label" }, h("span", {}, "Rearrange"), h("span", {}, "Done")));
  const collapseBtn = h("button", { class: "bar-btn", onclick: () => {
    const anyOpen = list.some(isOpen);
    list.forEach((b) => open.set(b, !anyOpen));
    draw();
  } }, icon("collapse"), h("span", { class: "fixed-label" }, h("span", {}, "Collapse all"), h("span", {}, "Expand all")));
  const bar = h("div", { class: "blocks-bar" },
    h("span", { class: "field-label" }, field.label || "blocks"),
    h("button", { class: "bar-btn add-block", onclick: () => { choosing = list.length; draw(); scrollToChooser(); } }, icon("plus"), "Add block"),
    rearrangeBtn, collapseBtn);

  function toggleRearrange() {
    rearranging = !rearranging;
    if (rearranging) {
      openBefore = new Set(list.filter(isOpen));
      list.forEach((b) => open.set(b, false));
      choosing = null;
    } else {
      list.forEach((b) => open.set(b, openBefore ? openBefore.has(b) : true));
    }
    draw();
  }

  // ----- adding -----
  function newBlock(def) {
    const b = { [key]: def.name };
    for (const f of def.fields || []) if (f.default !== undefined) b[f.name] = f.default;
    return b;
  }
  async function choose(def, at) {
    choosing = null;
    if (def.name === "photos") {
      // multi-upload: pick or upload many photos, get one Image block each
      const urls = await openPicker({ multiple: true, folder: ctx.imageFolder });
      if (urls && urls.length) {
        const imageDef = defs.find((d) => d.name === "image");
        list.splice(at, 0, ...urls.map((url) => ({ ...(imageDef ? newBlock(imageDef) : { [key]: "image" }), image: url })));
        ctx.changed();
      }
      return draw();
    }
    const b = newBlock(def);
    list.splice(at, 0, b);
    ctx.changed();
    draw();
    // put the cursor in the new block
    requestAnimationFrame(() => listEl.children[at]?.querySelector("textarea, input")?.focus());
  }
  function chooser(at) {
    return h("div", { class: "block chooser" },
      h("div", { class: "chooser-head" }, h("span", { class: "muted" }, "Choose a block:"),
        h("button", { class: "icon-btn", title: "Cancel", onclick: () => { choosing = null; draw(); } }, icon("x"))),
      h("div", { class: "chooser-options" }, defs.map((d) =>
        h("button", { class: "type-pill big", style: { "--c": colourFor(d.label || d.name) }, onclick: () => choose(d, at) }, d.label || d.name))));
  }
  const scrollToChooser = () => requestAnimationFrame(() => listEl.querySelector(".chooser")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));

  // ----- deleting -----
  const hasContent = (b) => Object.entries(b).some(([k, v]) => {
    if (k === key || k === "layout" || k === "pair" || k === "seconds") return false;
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : false;
  });
  async function remove(b) {
    if (hasContent(b) && !(await confirmBox(`Remove this ${labelOf(b)} block?`))) return;
    list.splice(list.indexOf(b), 1);
    ctx.changed();
    draw();
  }

  // ----- previews -----
  const previewOf = (b, i) => firstWords(b.text || b.caption || b.alt || "", 6) || `Item #${i + 1}`;

  // ----- one block -----
  function blockEl(b, i) {
    const def = defOf(b);
    const preview = h("span", { class: "block-preview" }, previewOf(b, i));
    const blockCtx = { ...ctx, changed: () => { ctx.changed(); preview.textContent = previewOf(b, list.indexOf(b)); } };
    const grip = h("button", { class: "grip", title: "Drag to move", onpointerdown: (e) => startDrag(e, el) }, icon("grip"));
    const head = h("div", { class: "block-head", onclick: (e) => {
      if (e.target.closest("button") && !e.target.closest(".block-toggle")) return;
      if (rearranging) return;
      open.set(b, !isOpen(b)); draw();
    } },
      rearranging ? grip : null,
      h("button", { class: "block-toggle", title: isOpen(b) ? "Collapse" : "Expand" }, icon("chevron", "chev")),
      h("span", { class: "type-pill" }, labelOf(b)),
      preview,
      h("button", { class: "icon-btn block-delete", title: "Remove block", onclick: () => remove(b) }, icon(rearranging ? "x" : "trash")));
    const el = h("div", { class: "block" + (isOpen(b) ? " open" : ""), style: { "--c": colourFor(labelOf(b)) } },
      head,
      isOpen(b) && !rearranging
        ? h("div", { class: "block-body" }, def ? renderFields(def.fields || [], b, blockCtx) : h("p", { class: "muted" }, `Unknown block type "${b[key]}"`))
        : null,
      rearranging ? null : h("button", { class: "insert", title: "Add a block here", onclick: () => { choosing = i + 1; draw(); scrollToChooser(); } }, icon("plus")));
    el.blockRef = b;
    return el;
  }

  // ----- drag to reorder (Rearrange mode) -----
  function startDrag(e, el) {
    e.preventDefault();
    // listen on the whole window: moving the block in the page would otherwise lose the pointer
    const handle = window;
    el.classList.add("dragging");
    const move = (ev) => {
      const siblings = [...listEl.children].filter((c) => c !== el && c.blockRef);
      const after = siblings.find((c) => { const r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (after) { if (el.nextSibling !== after) listEl.insertBefore(el, after); }
      else if (listEl.lastElementChild !== el) listEl.append(el);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      el.classList.remove("dragging");
      const order = [...listEl.children].map((c) => c.blockRef).filter(Boolean);
      if (order.some((b, i) => b !== list[i])) { list.splice(0, list.length, ...order); ctx.changed(); }
      draw();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  // ----- draw everything -----
  function draw() {
    root.classList.toggle("rearranging", rearranging);
    rearrangeBtn.classList.toggle("on", rearranging);
    rearrangeBtn.querySelector(".fixed-label").dataset.state = rearranging ? "2" : "1";
    collapseBtn.querySelector(".fixed-label").dataset.state = list.some(isOpen) ? "1" : "2";
    const items = list.map(blockEl);
    if (choosing !== null) items.splice(Math.min(choosing, items.length), 0, chooser(choosing));
    fill(listEl, ...items);
    if (!list.length && choosing === null) listEl.append(h("p", { class: "muted empty" }, "No blocks yet — use “Add block”."));
  }

  root.append(bar, listEl);
  draw();
  return root;
}
