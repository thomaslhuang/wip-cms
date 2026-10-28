// One editor per kind of field in .pages.yml ("type: string", "type: image", ...).
//
// Every editor works the same way: it shows obj[field.name] and writes changes straight
// back into obj, then calls ctx.changed() so the Save button lights up.
// To support a new field type, add a function to EDITORS below.
import { h, fill, icon, autosize, isPlainObject, toast } from "./util.js";
import { openPicker, chooseFiles, uploadFiles } from "./media.js";
import { renderBlocks } from "./blocks.js";
import { richBox } from "./rich.js";
import { codeArea } from "./code.js";

// ---------- shared bits ----------

const labelOf = (f) => f.label === false ? null : (f.label || f.name);

function wrap(field, ...content) {
  return h("div", { class: `field field-${field.type}${field.list ? " field-list" : ""}`, "data-name": field.name },
    labelOf(field) ? h("label", { class: "field-label" }, labelOf(field), field.required ? h("span", { class: "required" }, " *") : null) : null,
    ...content);
}

// ---------- the editors ----------

const EDITORS = {
  string(field, obj, ctx) {
    if (field.list) return wrap(field, stringList(field, obj, ctx));
    const input = h("input", { type: "text", class: "input", value: obj[field.name] ?? "", placeholder: field.options?.placeholder || "",
      oninput: () => { obj[field.name] = input.value; ctx.changed(); } });
    return wrap(field, input);
  },

  text(field, obj, ctx) {
    // captions are Markdown on the site, so they show their formatting while you write
    if (/^caption/i.test(field.name)) {
      const box = richBox({ value: obj[field.name] ?? "", inline: true, placeholder: `Add ${String(field.label || field.name).toLowerCase()}`,
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
    const value = obj[field.name] ? String(obj[field.name]) : "";
    const input = h("input", { type: "date", class: "input", value: value.slice(0, 10),
      onchange: () => {
        if (!input.value) { delete obj[field.name]; ctx.changed(); return; }
        const rest = /^\d{4}-\d{2}-\d{2}(T.*)$/.exec(String(obj[field.name] || ""));
        obj[field.name] = input.value + (rest ? rest[1] : "T00:00:00" + localOffset());
        ctx.changed();
      } });
    return wrap(field, input);
  },

  select(field, obj, ctx) {
    const values = (field.options?.values || []).map((v) => typeof v === "object" ? { value: String(v.value ?? v.name), label: v.label ?? v.value } : { value: String(v), label: String(v) });
    if (field.options?.multiple) return wrap(field, chips(field, obj, ctx, values));
    if (obj[field.name] === undefined && field.default !== undefined) obj[field.name] = field.default;
    const sel = h("select", { class: "input", onchange: () => { obj[field.name] = sel.value || undefined; ctx.changed(); } },
      field.default === undefined ? h("option", { value: "" }, "—") : null,
      values.map((v) => h("option", { value: v.value, selected: String(obj[field.name] ?? "") === v.value }, v.label)));
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
        h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; ctx.changed(); draw(); } }, icon("up")),
        h("button", { class: "icon-btn", title: "Move down", disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; ctx.changed(); draw(); } }, icon("down")),
        h("button", { class: "icon-btn", title: "Remove", onclick: () => { list.splice(i, 1); ctx.changed(); draw(); } }, icon("trash")))),
      h("button", { class: "btn small", onclick: () => { list.push(""); ctx.changed(); draw(); box.querySelector(".string-row:last-of-type input")?.focus(); } }, icon("plus"), "Add"));
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
  const input = h("input", { type: "text", class: "chip-input", list: listId, placeholder: field.options?.placeholder || "add…" });
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
      ...list.map((t, i) => h("span", { class: "chip" }, t, h("button", { class: "chip-x", title: "Remove", onclick: (e) => { e.stopPropagation(); list.splice(i, 1); ctx.changed(); draw(); } }, "×"))),
      input,
      h("datalist", { id: listId }, suggestions.filter((s) => !list.includes(s)).map((s) => h("option", { value: s }))));
    if (keepFocus) input.focus({ preventScroll: true });
  };
  draw();
  return box;
}

// Markdown (or HTML) writing, two ways (the choice is remembered):
//   Write    the formatting shows (bold looks bold); see rich.js
//   Source   the Markdown itself, in a monospace font, colour-coded; see code.js
// plus bold, italic, link and "line break" buttons that work in both.
const getMode = () => { try { return localStorage.getItem("wip-text-mode") || "write"; } catch { return "write"; } };
const putMode = (m) => { try { localStorage.setItem("wip-text-mode", m); } catch { /* fine */ } };

function richText(field, obj, ctx) {
  const isHtml = field.options?.format === "html";
  const value = () => obj[field.name] ?? "";
  const set = (v) => { obj[field.name] = v; ctx.changed(); };

  // Source: the text itself
  const t = autosize(h("textarea", { class: "input textarea prose source", rows: 3, spellcheck: !isHtml, value: value(), oninput: () => set(t.value) }));
  const source = codeArea(t, isHtml ? "html" : "markdown");
  // Write: formatted
  const box = isHtml ? htmlBox(value(), set) : richBox({ value: value(), placeholder: "Write something…", onChange: set });

  const insert = (before, after = "", placeholder = "") => {
    const { selectionStart: s, selectionEnd: e, value: v } = t;
    const chosen = v.slice(s, e) || placeholder;
    t.setRangeText(before + chosen + after, s, e, "end");
    if (!v.slice(s, e) && placeholder) t.setSelectionRange(s + before.length, s + before.length + placeholder.length);
    t.focus();
    t.dispatchEvent(new Event("input"));
  };
  let mode = getMode();
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
    if (remember) putMode(m);
  };
  tabs.append(h("button", { "data-mode": "write", onclick: () => setMode("write", true) }, "Write"),
              h("button", { "data-mode": "source", onclick: () => setMode("source", true) }, "Source"));
  const act = (cmd, md) => () => (mode === "source" ? md() : box.command(cmd));
  const tools = isHtml ? [] : [
    h("button", { class: "tool", title: "Bold (⌘B)", onclick: act("bold", () => insert("**", "**", "bold")) }, h("b", {}, "B")),
    h("button", { class: "tool", title: "Italic (⌘I)", onclick: act("italic", () => insert("*", "*", "italic")) }, h("i", {}, "I")),
    h("button", { class: "tool", title: "Link", onclick: act("link", () => insert("[", "](https://)", "link text")) }, "link"),
    h("button", { class: "tool", title: "Line break: a new line in the same paragraph (⇧↩)", onclick: act("break", () => insert("\\\n")) }, icon("linebreak"), "line break"),
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

function thumb(url, onRemove, extra = []) {
  return h("div", { class: "thumb" }, h("img", { src: url, alt: "", loading: "lazy" }),
    h("div", { class: "thumb-tools" }, ...extra, h("button", { class: "icon-btn", title: "Remove image", onclick: onRemove }, icon("trash"))));
}

function imageOne(field, obj, ctx) {
  const box = h("div", { class: "image-one" });
  const draw = () => {
    const url = obj[field.name];
    fill(box, 
      url ? thumb(url, () => { delete obj[field.name]; ctx.changed(); draw(); }) : null,
      url ? null : h("div", { class: "image-buttons" },
        h("button", { class: "btn small", onclick: async () => {
          const picked = await openPicker({ folder: ctx.imageFolder });
          if (picked && picked[0]) { obj[field.name] = picked[0]; ctx.changed(); draw(); }
        } }, icon("folder"), "Choose"),
        h("button", { class: "btn small", onclick: () => chooseFiles(false, async (files) => {
          try { const [u] = await uploadFiles(ctx.imageFolder, files); obj[field.name] = u; ctx.changed(); draw(); } catch (e) { toast(e.message, "error"); }
        }) }, icon("upload"), "Upload"),
        h("button", { class: "btn small", title: "Upload from your phone", onclick: async () => {
          const picked = await openPicker({ folder: ctx.imageFolder, phone: true });
          if (picked && picked[0]) { obj[field.name] = picked[0]; ctx.changed(); draw(); }
        } }, icon("phone"), "Phone")));
  };
  draw();
  return box;
}

function imageMany(field, obj, ctx) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = obj[field.name] ? [obj[field.name]] : [];
  const list = obj[field.name];
  const box = h("div", { class: "image-many" });
  const draw = () => {
    fill(box, 
      h("div", { class: "thumbs" }, list.map((url, i) => thumb(url, () => { list.splice(i, 1); ctx.changed(); draw(); }, [
        h("button", { class: "icon-btn", title: "Move earlier", disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; ctx.changed(); draw(); } }, icon("chevron", "flip")),
        h("button", { class: "icon-btn", title: "Move later", disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; ctx.changed(); draw(); } }, icon("chevron")),
      ]))),
      h("div", { class: "image-buttons" },
        h("button", { class: "btn small", onclick: async () => {
          const picked = await openPicker({ multiple: true, folder: ctx.imageFolder });
          if (picked && picked.length) { list.push(...picked); ctx.changed(); draw(); }
        } }, icon("folder"), "Choose"),
        h("button", { class: "btn small", onclick: () => chooseFiles(true, async (files) => {
          try { list.push(...await uploadFiles(ctx.imageFolder, files)); ctx.changed(); draw(); } catch (e) { toast(e.message, "error"); }
        }) }, icon("upload"), "Upload"),
        h("button", { class: "btn small", title: "Upload from your phone", onclick: async () => {
          const picked = await openPicker({ multiple: true, folder: ctx.imageFolder, phone: true });
          if (picked && picked.length) { list.push(...picked); ctx.changed(); draw(); }
        } }, icon("phone"), "Phone")));
  };
  draw();
  return box;
}

// ---------- lists of objects (home page spots, education, exhibitions) ----------

function objectList(field, obj, ctx) {
  if (!Array.isArray(obj[field.name])) obj[field.name] = [];
  const list = obj[field.name];
  const box = h("div", { class: "object-list" });
  const titleOf = (item, i) => {
    const first = (field.fields || []).find((f) => ["string", "text"].includes(f.type) && item[f.name]);
    return first ? String(item[first.name]) : `Item #${i + 1}`;
  };
  const draw = () => {
    fill(box, 
      ...list.map((item, i) => {
        const body = h("div", { class: "object-body" }, renderFields(field.fields || [], item, ctx));
        const card = h("div", { class: "object-card" },
          h("div", { class: "object-head" },
            h("button", { class: "object-toggle", onclick: () => card.classList.toggle("closed") }, icon("chevron", "chev"), h("span", { class: "object-title" }, titleOf(item, i))),
            h("button", { class: "icon-btn", title: "Move up", disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; ctx.changed(); draw(); } }, icon("up")),
            h("button", { class: "icon-btn", title: "Move down", disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; ctx.changed(); draw(); } }, icon("down")),
            h("button", { class: "icon-btn", title: "Remove", onclick: () => { list.splice(i, 1); ctx.changed(); draw(); } }, icon("trash"))),
          body);
        return card;
      }),
      h("button", { class: "btn small", onclick: () => { list.push({}); ctx.changed(); draw(); } }, icon("plus"), "Add"));
  };
  draw();
  return box;
}
