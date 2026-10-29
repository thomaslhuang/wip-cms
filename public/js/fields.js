// One editor per kind of field in .pages.yml ("type: string", "type: image", ...).
//
// Every editor works the same way: it shows obj[field.name] and writes changes straight
// back into obj, then calls ctx.changed() so the Save button lights up.
// To support a new field type, add a function to EDITORS below.
import { h, fill, icon, autosize, isPlainObject, toast } from "./util.js";
import { openPicker, chooseFiles, uploadFiles, kindOf, folderUrl, replaceImage } from "./media.js";
import { api } from "./api.js";
import { ghost, autoScroll, sortable } from "./drag.js";
import { renderBlocks } from "./blocks.js";
import { richBox } from "./rich.js";
import { codeArea } from "./code.js";
import { t as tr, t2, tl, fmtDate } from "./i18n.js";

// ---------- shared bits ----------

const labelOf = (f) => f.label === false ? null : tl(f.label || f.name);

// a field's help (description: in .pages.yml, which Pages CMS shows too) goes under it
function wrap(field, ...content) {
  return h("div", { class: `field field-${field.type}${field.list ? " field-list" : ""}`, "data-name": field.name },
    labelOf(field) ? h("label", { class: "field-label" }, labelOf(field), field.required ? h("span", { class: "required" }, " *") : null) : null,
    ...content,
    field.description ? h("p", { class: "field-help" }, String(field.description)) : null);
}

// ---------- the editors ----------

const EDITORS = {
  string(field, obj, ctx) {
    if (field.list) return wrap(field, stringList(field, obj, ctx));
    if (field.name === "slug" && ctx.slugGuard) return permalinkField(field, obj, ctx);
    const input = h("input", { type: "text", class: "input", value: obj[field.name] ?? "", placeholder: field.options?.placeholder || "",
      oninput: () => { obj[field.name] = input.value; ctx.changed(); } });
    return wrap(field, input);
  },

  text(field, obj, ctx) {
    // captions are Markdown on the site, so they show their formatting while you write
    if (/^caption/i.test(field.name)) {
      const box = richBox({ value: obj[field.name] ?? "", inline: true, placeholder: tr("Add {label}", { label: tr(String(field.label || field.name)).toLowerCase() }),
        onChange: (v) => { obj[field.name] = v; ctx.changed(); } });
      return wrap(field, box.el);
    }
    const t = autosize(h("textarea", { class: "input textarea", rows: 2, value: obj[field.name] ?? "",
      oninput: () => { obj[field.name] = t.value; ctx.changed(); } }));
    return wrap(field, t);
  },

  number(field, obj, ctx) {
    const input = h("input", { type: "number", class: "input narrow", value: obj[field.name] ?? "", step: "any",
      oninput: () => { obj[field.name] = input.value === "" ? undefined : Number(input.value); ctx.changed(); } });
    return wrap(field, input);
  },

  boolean(field, obj, ctx) {
    const sw = h("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(!!obj[field.name]),
      onclick: () => { obj[field.name] = !obj[field.name]; sw.setAttribute("aria-checked", String(!!obj[field.name])); ctx.changed(); } },
      h("span", { class: "knob" }));
    return wrap(field, sw);
  },

  // dates are stored like 2026-10-21T00:00:00-07:00; the picker changes only the day part
  date(field, obj, ctx) {
    // shown the same way as the date under the title ("October 22, 2026", in your date
    // style); clicking it opens the date picker
    const value = obj[field.name] ? String(obj[field.name]) : "";
    const shown = h("span", {});
    const show = () => { shown.textContent = obj[field.name] ? fmtDate(obj[field.name], "long") : tr("Add a date"); };
    const input = h("input", { type: "date", class: "date-input", "aria-label": labelOf(field) || tr("Date"), value: value.slice(0, 10),
      onclick: () => { try { input.showPicker(); } catch { /* opens by itself */ } },
      onchange: () => {
        if (!input.value) { delete obj[field.name]; ctx.changed(); show(); return; }
        const rest = /^\d{4}-\d{2}-\d{2}(T.*)$/.exec(String(obj[field.name] || ""));
        obj[field.name] = input.value + (rest ? rest[1] : "T00:00:00" + localOffset());
        ctx.changed();
        show();
      } });
    show();
    return wrap(field, h("label", { class: "date-field" }, icon("calendar"), shown, input));
  },

  select(field, obj, ctx) {
    const values = (field.options?.values || []).map((v) => typeof v === "object" ? { value: String(v.value ?? v.name), label: v.label ?? v.value } : { value: String(v), label: String(v) });
    if (field.options?.multiple) return wrap(field, chips(field, obj, ctx, values));
    if (obj[field.name] === undefined && field.default !== undefined) obj[field.name] = field.default;
    const sel = h("select", { class: "input", onchange: () => { obj[field.name] = sel.value || undefined; ctx.changed(); } },
      field.default === undefined ? h("option", { value: "" }, "—") : null,
      values.map((v) => h("option", { value: v.value, selected: String(obj[field.name] ?? "") === v.value }, tl(String(v.label)))));
    return wrap(field, sel);
  },

  code(field, obj, ctx) {
    const t = autosize(h("textarea", { class: "input textarea code", rows: 4, spellcheck: false, value: obj[field.name] ?? "",
      oninput: () => { obj[field.name] = t.value; ctx.changed(); } }));
    return wrap(field, codeArea(t, "html"));
  },

  "rich-text"(field, obj, ctx) {
    return wrap(field, richText(field, obj, ctx));
  },

  image(field, obj, ctx) {
    return wrap(field, field.options?.multiple ? imageMany(field, obj, ctx) : imageOne(field, obj, ctx));
  },

  object(field, obj, ctx) {
    if (field.list) return wrap(field, objectList(field, obj, ctx));
    if (!isPlainObject(obj[field.name])) obj[field.name] = {};
    return wrap(field, renderFields(field.fields || [], obj[field.name], ctx));
  },

  block(field, obj, ctx) {
    if (!Array.isArray(obj[field.name])) obj[field.name] = [];
    return renderBlocks(field, obj[field.name], ctx);
  },
};

export function renderField(field, obj, ctx) {
  if (field.hidden) {
    if (obj[field.name] === undefined && field.default !== undefined) obj[field.name] = field.default;
    return null;
  }
  const editor = EDITORS[field.type] || EDITORS.string;
  return editor(field, obj, ctx);
}

// A group of fields (inside a block, or an object). Some pairs sit side by side to save
// space, like in the Pages CMS script: image + caption, a switch + the next field, and a
// number + the next field.
export function renderFields(fields, obj, ctx) {
  const grid = h("div", { class: "field-grid" });
  const visible = fields.filter((f) => !f.hidden);
  fields.filter((f) => f.hidden).forEach((f) => renderField(f, obj, ctx));
  for (let i = 0; i < visible.length; i++) {
    const f = visible[i], next = visible[i + 1];
    const el = renderField(f, obj, ctx);
    const pairs = next && (
      (f.type === "image" && !f.options?.multiple && next.type === "text") ||
      f.type === "boolean" || f.type === "number");
    if (pairs) {
      el.classList.add("col-a");
      const el2 = renderField(next, obj, ctx);
      el2.classList.add("col-b");
      grid.append(el, el2);
      i++;
    } else grid.append(el);
  }
  return grid;
}

// ---------- helpers for the editors above ----------

// A list item's permalink ("slug"): the last part of its page's address. Spaces and anything a
// web address can't hold become "-" as you leave the box (capitals are kept), and changing one
// that was already there says what that does to links. Two items can't share one: saving
// says so (lib/listfile.js).
function permalinkField(field, obj, ctx) {
  const was = obj[field.name] ? String(obj[field.name]) : "";
  const note = h("p", { class: "field-help warn", hidden: true });
  const clean = (v) => String(v || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^A-Za-z0-9._~-]+/g, "-").replace(/^-+|-+$/g, "");
  const input = h("input", { type: "text", class: "input", value: was, spellcheck: false,
    oninput: () => { obj[field.name] = input.value; show(); ctx.changed(); },
    onblur: () => { const v = clean(input.value); if (v !== input.value) { input.value = v; obj[field.name] = v; ctx.changed(); } show(); } });
  const show = () => {
    const now = clean(input.value);
    note.hidden = !was || now === was;
    note.textContent = tr("Changing the permalink changes this page's address: links to the old one (…/{was}/), from other sites or saved by people, will stop working.", { was });
  };
  return wrap(field, input, note);
}

function localOffset() {
  const off = -new Date().getTimezoneOffset(), pad = (n) => String(n).padStart(2, "0");
  return (off >= 0 ? "+" : "-") + pad(Math.floor(Math.abs(off) / 60)) + ":" + pad(Math.abs(off) % 60);
}

// list of short texts (related posts, nonbreaking phrases)
function stringList(field, obj, ctx) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = obj[field.name] ? [obj[field.name]] : [];
  const list = obj[field.name];
  const box = h("div", { class: "string-list" });
  const draw = () => {
    fill(box, 
      ...list.map((value, i) => h("div", { class: "string-row" },
        h("input", { type: "text", class: "input", value, oninput: (e) => { list[i] = e.target.value; ctx.changed(); } }),
        h("button", { class: "icon-btn", title: tr("Move up"), disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; ctx.changed(); draw(); } }, icon("up")),
        h("button", { class: "icon-btn", title: tr("Move down"), disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; ctx.changed(); draw(); } }, icon("down")),
        h("button", { class: "icon-btn", title: tr("Remove"), onclick: () => { list.splice(i, 1); ctx.changed(); draw(); } }, icon("trash")))),
      h("button", { class: "btn small", onclick: () => { list.push(""); ctx.changed(); draw(); box.querySelector(".string-row:last-of-type input")?.focus(); } }, icon("plus"), tr("Add")));
  };
  draw();
  return box;
}

// tags-style picker: chips, suggestions as you type, and new values allowed
function chips(field, obj, ctx, values) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = obj[field.name] ? [obj[field.name]] : [];
  const list = obj[field.name];
  const suggestions = [...new Set([...values.map((v) => v.value), ...(field.name === "tags" ? ctx.tags || [] : [])])];
  const listId = "dl-" + Math.random().toString(36).slice(2);
  const input = h("input", { type: "text", class: "chip-input", list: listId, placeholder: tr(field.options?.placeholder || "add…") });
  const box = h("div", { class: "chips input", onclick: () => input.focus() });
  const add = (raw, keepFocus = false) => {
    const v = raw.trim();
    if (!v) return;
    const existing = suggestions.find((s) => s.toLowerCase() === v.toLowerCase()) || v; // reuse the spelling you already use
    if (!list.some((t) => t.toLowerCase() === existing.toLowerCase())) { list.push(existing); ctx.changed(); }
    input.value = "";
    draw(keepFocus);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input.value, true); }
    if (e.key === "Backspace" && !input.value && list.length) { list.pop(); ctx.changed(); draw(true); }
  });
  input.addEventListener("change", () => { if (suggestions.includes(input.value)) add(input.value, true); });
  input.addEventListener("blur", () => add(input.value));
  const draw = (keepFocus = false) => {
    fill(box, 
      ...list.map((t, i) => h("span", { class: "chip" }, t, h("button", { class: "chip-x", title: tr("Remove"), onclick: (e) => { e.stopPropagation(); list.splice(i, 1); ctx.changed(); draw(); } }, "×"))),
      input,
      h("datalist", { id: listId }, suggestions.filter((s) => !list.includes(s)).map((s) => h("option", { value: s }))));
    if (keepFocus) input.focus({ preventScroll: true });
  };
  draw();
  return box;
}

// Markdown (or HTML) writing, two ways (the choice is remembered):
//   Write    the formatting shows (bold looks bold); see rich.js
//   Source   the Markdown itself, in a monospace font, color-coded; see code.js
// plus bold, italic, link and "line break" buttons that work in both.
// Every text box opens in Write; Source lasts while you're on that page.
try { localStorage.removeItem("wip-text-mode"); } catch { /* fine */ }   // (it used to be remembered everywhere)

function richText(field, obj, ctx) {
  const isHtml = field.options?.format === "html";
  const value = () => obj[field.name] ?? "";
  const set = (v) => { obj[field.name] = v; ctx.changed(); };

  // Source: the text itself
  const t = autosize(h("textarea", { class: "input textarea prose source", rows: 3, spellcheck: !isHtml, value: value(), oninput: () => set(t.value) }));
  const source = codeArea(t, isHtml ? "html" : "markdown");
  // Write: formatted
  const box = isHtml ? htmlBox(value(), set) : richBox({ value: value(), placeholder: tr("Write something…"), onChange: set });

  const insert = (before, after = "", placeholder = "") => {
    const { selectionStart: s, selectionEnd: e, value: v } = t;
    const chosen = v.slice(s, e) || placeholder;
    t.setRangeText(before + chosen + after, s, e, "end");
    if (!v.slice(s, e) && placeholder) t.setSelectionRange(s + before.length, s + before.length + placeholder.length);
    t.focus();
    t.dispatchEvent(new Event("input"));
  };
  let mode = "write";
  const tabs = h("div", { class: "seg" });
  const setMode = (m, remember) => {
    mode = m;
    if (m === "source") {
      t.value = value();
      requestAnimationFrame(() => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; source.repaint(); });
    }
    else box.set(value());
    source.hidden = m !== "source";
    box.el.hidden = m === "source";
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  };
  tabs.append(h("button", { "data-mode": "write", onclick: () => setMode("write", true) }, tr("Write")),
              h("button", { "data-mode": "source", onclick: () => setMode("source", true) }, tr("Source")));
  const act = (cmd, md) => () => (mode === "source" ? md() : box.command(cmd));
  const tools = isHtml ? [] : [
    h("button", { class: "tool", title: tr("Bold (⌘B)"), onclick: act("bold", () => insert("**", "**", "bold")) }, h("b", {}, "B")),
    h("button", { class: "tool", title: tr("Italic (⌘I)"), onclick: act("italic", () => insert("*", "*", "italic")) }, h("i", {}, "I")),
    h("button", { class: "tool", title: tr("Link"), onclick: act("link", () => insert("[", "](https://)", tr("link text"))) }, tr("link")),
    h("button", { class: "tool", title: tr("Line break: a new line in the same paragraph (⇧↩)"), onclick: act("break", () => insert("\\\n")) }, icon("linebreak"), tr("line break")),
  ];
  const el = h("div", { class: "rich" }, h("div", { class: "rich-bar" }, ...tools, tabs), box.el, source);
  setMode(mode);
  return el;
}

// HTML-format text fields: Write edits the HTML directly
function htmlBox(value, onChange) {
  const el = h("div", { class: "rich-box", contenteditable: "true", role: "textbox", "aria-multiline": "true", html: value });
  el.addEventListener("input", () => onChange(el.innerHTML));
  return { el, set: (v) => { el.innerHTML = v; }, command(cmd) { el.focus(); document.execCommand(cmd === "break" ? "insertLineBreak" : cmd); onChange(el.innerHTML); } };
}

// ---------- images ----------
//
// Where an image field's pictures live, and what it saves:
//   most fields save the picture's address (/images/blog/x/photo.webp), and uploads go
//     into the post's own image folder (ctx.imageFolder)
//   options.path: "src/img/projects/{slug}" puts uploads (and opens the picker) in that
//     folder instead; {slug} or any other field in braces is filled from the post
//   options.store: filename saves just "photo.webp", for sites whose templates add the
//     folder themselves. A picture chosen from another folder is copied in first.
//   options.links: true also allows a web address (a video on Google Drive, say)

const fillPath = (tpl, entry) => {
  let missing = false;
  const out = String(tpl).replace(/^\/+|\/+$/g, "").replace(/\{(\w+)\}/g, (m, n) => { const v = entry?.[n]; if (v == null || v === "") missing = true; return String(v ?? ""); });
  return missing ? null : out;
};
const isLink = (v) => /^https?:\/\//i.test(String(v || ""));
function imageSpot(field, ctx) {
  const folder = (field.options?.path && fillPath(field.options.path, ctx.entry)) || ctx.imageFolder;
  const byName = field.options?.store === "filename";
  const base = byName ? folderUrl(folder) : null;
  return {
    folder,
    // the stored value -> an address to show it
    show: (v) => !v || isLink(v) || !byName || /^\//.test(String(v)) ? v : base ? `${base}/${String(v).split("/").map(encodeURIComponent).join("/")}` : null,
    // picked or uploaded addresses -> what to store (copying pictures in from elsewhere)
    async keep(urls) {
      if (!byName) return urls;
      const out = [];
      for (const url of urls) {
        const u = decodeURI(url);
        if (base && u.startsWith(base + "/") && !u.slice(base.length + 1).includes("/")) out.push(u.slice(base.length + 1));
        else { try { out.push((await api.copyMedia(url, folder)).name); } catch (e) { toast(e.message, "error"); } }
      }
      return out;
    },
  };
}

// a picture in a field: Replace (a new version, same name, so everywhere using it updates) and Remove
function thumb(url, onRemove, extra = []) {
  if (isLink(url) && !/\.(webp|jpe?g|png|gif|avif|svg)(\?|$)/i.test(url)) return linkThumb(url, onRemove);
  const canReplace = !isLink(url) && /\.(webp|jpe?g|png)(\?|$)/i.test(String(url || ""));
  return h("div", { class: "thumb" }, h("img", { src: url, alt: "", loading: "lazy" }),
    h("div", { class: "thumb-tools" }, ...extra,
      canReplace ? h("button", { class: "icon-btn", title: tr("Replace with a new version (same name, so everywhere it's used updates)"), onclick: (e) => { e.stopPropagation(); replaceImage(url); } }, icon("refresh")) : null,
      h("button", { class: "icon-btn", title: tr("Remove image"), onclick: onRemove }, icon("trash"))));
}

// a web address in an image field (a video on Google Drive): shown as the address, editable
function linkThumb(url, onRemove, onEdit) {
  const input = h("input", { class: "input link-input", value: url, "aria-label": tr("Web address"), readonly: !onEdit,
    onchange: () => onEdit?.(input.value.trim()) });
  return h("div", { class: "thumb link-thumb" }, icon("link"), input,
    h("button", { class: "icon-btn", title: tr("Remove"), onclick: onRemove }, icon("trash")));
}

// the buttons under an image field:
//   Choose from [Library]   or upload from [Computer] [Phone]   (or [Paste a link])
// onPicked(urls) gets the chosen or uploaded /images/... addresses
function imageButtons(folder, multiple, onPicked, links = false) {
  const linkBtn = links ? h("button", { class: "btn small", title: tr("A web address, e.g. a video on Google Drive"), onclick: () => {
    const input = h("input", { class: "input link-input", placeholder: "https://…", "aria-label": tr("Web address"),
      onkeydown: (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") input.replaceWith(linkBtn); }, onblur: () => done() });
    const done = () => { const v = input.value.trim(); if (isLink(v)) onPicked([v], true); else if (input.isConnected) input.replaceWith(linkBtn); };
    linkBtn.replaceWith(input);
    input.focus();
  } }, icon("link"), tr("Link")) : null;
  return h("div", { class: "image-buttons" },
    h("span", { class: "image-buttons-label" }, tr("Choose from")),
    h("button", { class: "btn small", onclick: async () => {
      const picked = await openPicker({ multiple, folder });
      if (picked && picked.length) onPicked(picked);
    } }, icon("folder"), tr("Library")),
    h("span", { class: "image-buttons-label" }, tr("or upload from")),
    h("button", { class: "btn small", title: tr("Upload from this computer"), onclick: () => chooseFiles(multiple, async (files) => {
      try { onPicked(await uploadFiles(folder, files)); } catch (e) { toast(e.message, "error"); }
    }) }, icon("laptop"), tr("Computer")),
    h("button", { class: "btn small", title: tr("Upload from your phone"), onclick: async () => {
      const picked = await openPicker({ multiple, folder, phone: true });
      if (picked && picked.length) onPicked(picked);
    } }, icon("phone"), tr("Phone")),
    links ? h("span", { class: "image-buttons-label" }, tr("or")) : null, linkBtn);
}

// pictures dragged in from Finder onto an image field go straight into it
function acceptDrops(el, folder, onPicked) {
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  el.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); el.classList.add("drop-here"); });
  el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop-here"); });
  el.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    el.classList.remove("drop-here");
    const files = [...e.dataTransfer.files].filter((f) => kindOf(f) === "image");
    if (!files.length) return toast(tr("Only pictures can go here."), "error");
    try { onPicked(await uploadFiles(folder, files)); } catch (err) { toast(err.message, "error"); }
  });
}

// one picture. In an image block you can pick or upload several at once: the first goes
// here and each of the others gets its own image block after this one (ctx.splitImages).
function imageOne(field, obj, ctx) {
  const box = h("div", { class: "image-one" });
  const many = !!ctx.splitImages;
  const spot = imageSpot(field, ctx);
  const set = async (urls, asIs) => {
    const kept = asIs ? urls : await spot.keep(urls);
    if (!kept.length) return;
    obj[field.name] = kept[0];
    ctx.changed();
    if (many && kept.length > 1) ctx.splitImages(kept.slice(1)); else draw();
  };
  const remove = () => { delete obj[field.name]; ctx.changed(); draw(); };
  const draw = () => {
    const value = obj[field.name];
    const shown = spot.show(value);
    fill(box,
      !value ? imageButtons(spot.folder, many, set, !!field.options?.links)
        : isLink(value) ? linkThumb(value, remove, (v) => { if (v) { obj[field.name] = v; ctx.changed(); } })
        : thumb(shown, remove));
  };
  acceptDrops(box, spot.folder, set);
  draw();
  return box;
}

// several images (carousel, collage, a project's gallery): drag one to change the order.
// A copy follows the pointer and a faded placeholder shows where it will land; dragging
// near the edge of a carousel strip (or the page) scrolls it. With a mouse, just drag; on
// a touch screen, press and hold a moment first (so swiping still scrolls).
function imageMany(field, obj, ctx) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = obj[field.name] ? [obj[field.name]] : [];
  const list = obj[field.name];
  const box = h("div", { class: "image-many" });
  const spot = imageSpot(field, ctx);
  const add = async (urls, asIs) => { const kept = asIs ? urls : await spot.keep(urls); list.push(...kept); ctx.changed(); draw(); };
  let strip;
  const draw = () => {
    strip = h("div", { class: "thumbs" }, list.map((url, i) => {
      const el = thumb(spot.show(url), () => { list.splice(i, 1); ctx.changed(); draw(); });
      el.dataset.index = i;
      el.dataset.total = list.length;
      el.title = tr("Drag to move");
      el.addEventListener("pointerdown", (e) => startDrag(e, el));
      el.addEventListener("dragstart", (e) => e.preventDefault());   // no browser image dragging
      return el;
    }));
    fill(box, strip, imageButtons(spot.folder, true, add, !!field.options?.links));
  };
  acceptDrops(box, spot.folder, add);

  function startDrag(e, el) {
    if (e.button > 0 || e.target.closest("button")) return;
    const touch = e.pointerType === "touch";
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false, timer = null, copy = null, scroller = null, last = e;
    const begin = () => {
      dragging = true;
      const r = el.getBoundingClientRect();
      const w = Math.min(r.width, 170);
      copy = ghost(h("img", { src: el.querySelector("img").src, alt: "" }), w, last, { x: w / 2, y: (w * r.height / r.width) / 2 });
      el.classList.add("placeholder");
      box.classList.add("reordering");
      scroller = autoScroll([strip, box.closest(".docpane, .inspector")], () => place(last));
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    };
    if (touch) timer = setTimeout(begin, 280);
    // Pointing at another picture moves this one to its place: after it if it comes later,
    // before it if it comes earlier. The picture just passed is ignored until the pointer
    // leaves it, so the two can't keep swapping back and forth as the layout shifts.
    let passed = null;
    const inside = (c, ev) => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; };
    const place = (ev) => {
      if (passed && !inside(passed, ev)) passed = null;
      const kids = [...strip.children];
      const over = kids.find((c) => c !== el && inside(c, ev));
      if (!over || over === passed) return;
      if (kids.indexOf(over) > kids.indexOf(el)) strip.insertBefore(el, over.nextSibling);
      else strip.insertBefore(el, over);
      passed = over;
    };
    const move = (ev) => {
      last = ev;
      if (!dragging) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (touch) return end();          // moved before the hold: it's a scroll, not a drag
        begin();
      }
      ev.preventDefault();
      copy.move(ev);
      scroller.at(ev);
      place(ev);
    };
    const end = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!dragging) return;
      copy.remove();
      scroller.stop();
      el.classList.remove("placeholder");
      box.classList.remove("reordering");
      const order = [...strip.children].map((c) => list[Number(c.dataset.index)]);
      const scrollLeft = strip.scrollLeft;
      if (order.some((u, k) => u !== list[k])) { list.splice(0, list.length, ...order); ctx.changed(); }
      draw();
      strip.scrollLeft = scrollLeft;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  draw();
  return box;
}

// ---------- lists of objects (home page spots, exhibitions, a gallery of pictures with captions) ----------
// Three layouts, depending on what the items hold:
//   tiles  items with a picture (collage spots, a gallery): a grid of squares to drag into
//          order; click one to edit it underneath. "Add pictures" adds several at once.
//   rows   short items (a year and a line of text): one compact row each, with a handle to drag
//   cards  anything else (lists inside lists): cards that fold, with up / down buttons

const SIMPLE = new Set(["string", "number", "select", "boolean", "date", undefined]);
function objectList(field, obj, ctx) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = [];
  const fields = (field.fields || []).filter((f) => !f.hidden);
  if (fields.some((f) => f.type === "image")) return objectTiles(field, obj, ctx);
  if (fields.length && fields.length <= 3 && fields.every((f) => SIMPLE.has(f.type) && !f.list && !(f.type === "select" && f.options?.multiple))) return objectRows(field, obj, ctx);
  return objectCards(field, obj, ctx);
}

const plainText = (v) => String(v).replace(/[*_`#>\\]|<[^>]+>/g, "").replace(/\s+/g, " ").trim();
// an item's name: its first text that has something in it
function itemName(fields, item, i) {
  const first = fields.find((f) => ["string", "text", undefined].includes(f.type) && item[f.name] && typeof item[f.name] !== "object");
  if (first) return plainText(item[first.name]).slice(0, 80);
  const pic = fields.find((f) => f.type === "image" && item[f.name]);
  if (pic) return String([].concat(item[pic.name])[0]).split("/").pop();
  return tr("Item {n}", { n: i + 1 });
}
const freshItem = (fields) => Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));

function objectTiles(field, obj, ctx) {
  const list = obj[field.name];
  const fields = field.fields || [];
  const picField = fields.find((f) => f.type === "image");
  const spot = imageSpot(picField, ctx);
  const single = !picField.options?.multiple;
  let open = null;   // the item being edited
  const box = h("div", { class: "object-tiles" });
  const grid = h("div", { class: "tile-grid" });
  const editor = h("div", { class: "tile-editor" });
  sortable(grid, { onMove: (from, to) => { const [it] = list.splice(from, 1); list.splice(to, 0, it); ctx.changed(); draw(); } });
  const addPictures = async (urls, asIs) => {
    const kept = asIs ? urls : await spot.keep(urls);
    for (const v of kept) list.push({ ...freshItem(fields), [picField.name]: single ? v : [v] });
    if (kept.length) { ctx.changed(); draw(); }
  };
  const draw = () => {
    if (open && !list.includes(open)) open = null;
    fill(grid,
      ...list.map((item, i) => {
        const pics = [].concat(item[picField.name] || []);
        const first = pics[0];
        return h("button", { class: "sort-item obj-tile" + (item === open ? " on" : ""), title: itemName(fields, item, i), onclick: () => { open = open === item ? null : item; draw(); if (open) requestAnimationFrame(() => editor.scrollIntoView({ block: "nearest", behavior: "smooth" })); } },
          first && !isLink(first) ? h("img", { src: spot.show(first), alt: "", loading: "lazy", draggable: false }) : h("span", { class: "obj-tile-empty" }, first ? icon("link") : icon("image")),
          pics.length > 1 ? h("span", { class: "obj-tile-count" }, String(pics.length)) : null,
          h("span", { class: "obj-tile-name" }, itemName(fields, item, i)));
      }),
      h("button", { class: "obj-tile add sort-fixed", title: tr("Add"), onclick: () => { const item = freshItem(fields); list.push(item); open = item; ctx.changed(); draw(); } }, icon("plus"), h("span", {}, tr("Add"))));
    if (!open) { fill(editor); editor.hidden = true; return; }
    editor.hidden = false;
    const i = list.indexOf(open);
    fill(editor,
      h("div", { class: "tile-editor-head" },
        h("span", { class: "tile-editor-title" }, itemName(fields, open, i)),
        h("button", { class: "icon-btn", title: tr("Remove"), onclick: () => { list.splice(i, 1); open = null; ctx.changed(); draw(); } }, icon("trash")),
        h("button", { class: "btn small", onclick: () => { open = null; draw(); } }, tr("Done"))),
      renderFields(fields, open, { ...ctx, changed: () => { ctx.changed(); redrawTiles(); } }));
  };
  // names and pictures in the grid follow your typing, without redrawing the open editor
  let tileTimer = null;
  const redrawTiles = () => { clearTimeout(tileTimer); tileTimer = setTimeout(() => {
    const kids = grid.querySelectorAll(".obj-tile:not(.add)");
    list.forEach((item, i) => {
      const t = kids[i]; if (!t) return;
      const pics = [].concat(item[picField.name] || []);
      t.querySelector(".obj-tile-name").textContent = itemName(fields, item, i);
      const img = t.querySelector("img");
      if (pics[0] && !isLink(pics[0])) { if (img) img.src = spot.show(pics[0]); else draw(); }
    });
    const head = editor.querySelector(".tile-editor-title");
    if (head && open) head.textContent = itemName(fields, open, list.indexOf(open));
  }, 150); };
  fill(box, grid, editor,
    single ? h("div", { class: "object-add" }, h("span", { class: "image-buttons-label" }, tr("Add pictures:")), imageButtons(spot.folder, true, addPictures, !!picField.options?.links)) : null);
  if (single) acceptDrops(box, spot.folder, addPictures);
  draw();
  return box;
}

function objectRows(field, obj, ctx) {
  const list = obj[field.name];
  const fields = (field.fields || []).filter((f) => !f.hidden);
  const rows = h("div", { class: "obj-rows" });
  sortable(rows, { handle: ".obj-grip", onMove: (from, to) => { const [it] = list.splice(from, 1); list.splice(to, 0, it); ctx.changed(); draw(); } });
  const draw = () => {
    fill(rows, list.map((item, i) => h("div", { class: "obj-row" },
      h("span", { class: "obj-grip", title: tr("Drag to move") }, icon("grip")),
      fields.map((f) => {
        const el = renderField(f, item, ctx);
        el?.querySelector(".field-label")?.remove();
        const input = el?.querySelector("input, select, textarea");
        if (input && !input.placeholder) input.placeholder = tl(f.label || f.name);
        el?.classList.add(f.type === "number" || /year|date|^n(um(ber)?)?$/i.test(f.name) ? "obj-cell-narrow" : "obj-cell");
        return el;
      }),
      h("button", { class: "icon-btn", title: tr("Remove"), onclick: () => { list.splice(i, 1); ctx.changed(); draw(); } }, icon("trash")))));
  };
  draw();
  return h("div", { class: "object-rows" }, rows,
    h("button", { class: "btn small", onclick: () => { list.push(freshItem(fields)); ctx.changed(); draw(); rows.lastElementChild?.querySelector("input")?.focus(); } }, icon("plus"), tr("Add")));
}

function objectCards(field, obj, ctx) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = [];
  const list = obj[field.name];
  const fields = field.fields || [];
  const picField = fields.find((f) => f.type === "image" && !f.options?.multiple);
  const spot = picField ? imageSpot(picField, ctx) : null;
  const box = h("div", { class: "object-list" + (picField ? " has-pics" : "") });
  const opened = new WeakSet(), closed = new WeakSet();
  const startClosed = list.length > 4;
  const isOpen = (item) => opened.has(item) || (!startClosed && !closed.has(item));
  const plain = (v) => String(v).replace(/[*_`#>\\]|<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const titleOf = (item, i) => {
    const first = fields.find((f) => ["string", "text", undefined].includes(f.type) && item[f.name] && typeof item[f.name] !== "object");
    if (first) return plain(item[first.name]).slice(0, 80);
    if (picField && item[picField.name]) return String(item[picField.name]).split("/").pop();
    return tr("Item {n}", { n: i + 1 });
  };
  const fresh = () => Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
  const addPictures = async (urls, asIs) => {
    const kept = asIs ? urls : await spot.keep(urls);
    for (const v of kept) { const item = { ...fresh(), [picField.name]: v }; opened.add(item); list.push(item); }
    if (kept.length) { ctx.changed(); draw(); }
  };
  const move = (i, j) => { [list[i], list[j]] = [list[j], list[i]]; ctx.changed(); draw(); };
  const draw = () => {
    fill(box,
      ...list.map((item, i) => {
        const pic = picField && item[picField.name];
        const card = h("div", { class: "object-card" + (isOpen(item) ? "" : " closed") },
          h("div", { class: "object-head" },
            h("button", { class: "object-toggle", "aria-expanded": String(isOpen(item)), onclick: () => {
              if (isOpen(item)) { opened.delete(item); closed.add(item); } else { closed.delete(item); opened.add(item); }
              draw();
            } }, icon("chevron", "chev"),
              picField ? (pic && !isLink(pic) ? h("img", { class: "object-pic", src: spot.show(pic), alt: "", loading: "lazy" }) : h("span", { class: "object-pic empty" }, pic ? icon("link") : null)) : null,
              h("span", { class: "object-title" }, titleOf(item, i))),
            h("button", { class: "icon-btn", title: tr("Move up"), disabled: i === 0, onclick: () => move(i, i - 1) }, icon("up")),
            h("button", { class: "icon-btn", title: tr("Move down"), disabled: i === list.length - 1, onclick: () => move(i, i + 1) }, icon("down")),
            h("button", { class: "icon-btn", title: tr("Remove"), onclick: () => { list.splice(i, 1); ctx.changed(); draw(); } }, icon("trash"))),
          isOpen(item) ? h("div", { class: "object-body" }, renderFields(fields, item, ctx)) : null);
        return card;
      }),
      h("div", { class: "object-add" },
        picField ? [h("span", { class: "image-buttons-label" }, tr("Add pictures:")), imageButtons(spot.folder, true, addPictures, !!picField.options?.links)] : null,
        h("button", { class: "btn small", onclick: () => { const item = fresh(); opened.add(item); list.push(item); ctx.changed(); draw(); } }, icon("plus"), picField ? tr("Add an empty one") : tr("Add"))),
      list.length > 4 ? h("div", { class: "object-fold" },
        h("button", { class: "link-btn", onclick: () => { list.forEach((x) => { closed.delete(x); opened.add(x); }); draw(); } }, tr("Open all")),
        h("button", { class: "link-btn", onclick: () => { list.forEach((x) => { opened.delete(x); closed.add(x); }); draw(); } }, tr("Fold all"))) : null);
  };
  if (picField) acceptDrops(box, spot.folder, addPictures);
  draw();
  return box;
}
