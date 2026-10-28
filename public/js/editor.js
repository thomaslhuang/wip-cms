// One open post, project or page.
//
// Builds two things for the app (app.js) to put in place:
//   doc        the post as a document: big title, a line with the date and tags, then the blocks.
//              Pages without blocks (home, about, settings) show their fields here instead.
//   inspector  the post's details: featured image, date, switches, tags, its web address
//
// Saving is automatic, a moment after you stop typing (and straight away with ⌘S).
// "Revert to when opened" puts back what the post was when you opened it.
import { h, fill, icon, toast, confirmBox, autosize } from "./util.js";
import { api } from "./api.js";
import { renderField } from "./fields.js";

const SAVE_AFTER = 1200;            // ms after the last change
const SKIP = new Set(["newTags"]);   // Pages CMS-only helpers
const ROW_TYPES = new Set(["date", "boolean"]); // shown as "label …… control" rows in the inspector

export async function openEditor({ file, section, config }) {
  const entry = await api.read(file);
  const data = entry.data;
  // tags typed into "new tags" in Pages CMS that haven't been merged yet
  if (typeof data.newTags === "string" && data.newTags.trim()) {
    data.tags = [...new Set([...(data.tags || []), ...data.newTags.split(",").map((t) => t.trim()).filter(Boolean)])];
  }
  delete data.newTags;
  const original = JSON.stringify({ data, body: entry.body });

  // ----- saving -----
  let pending = false, saving = null, timer = null, failed = false;
  const changeListeners = new Set(), statusListeners = new Set();
  let statusText = "Saved";
  const setStatus = (t) => { statusText = t; statusListeners.forEach((fn) => fn(t)); };

  async function save() {
    clearTimeout(timer);
    if (!pending) return saving;
    if (saving) { await saving; return save(); }
    pending = false;
    setStatus("Saving…");
    saving = api.save(file, data, entry.body)
      .then(() => {
        failed = false;
        if (!pending) setStatus("Saved");
        if (data.tags) config.tags = [...new Set([...(config.tags || []), ...data.tags])];
      })
      .catch((e) => { pending = true; failed = true; setStatus("Not saved"); toast(e.message, "error"); })
      .finally(() => { saving = null; });
    return saving;
  }
  const changed = () => {
    pending = true;
    if (!failed) setStatus("Edited");
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_AFTER);
    changeListeners.forEach((fn) => fn());
    drawMeta();
  };

  // the post's own image folder: uploads go there, and the picker opens there
  const imageFolder = section
    ? (await api.imageFolder(file)).folder
    : `${config.site.mediaInput}/${(file.match(/([^/]+)\.json$/) || [, ""])[1]}`.replace(/\/$/, "");
  const ctx = { changed, imageFolder, tags: config.tags };

  // ----- the document -----
  const fields = ((section ? section.fields : config.sections.find((s) => s.path === file)?.fields) || []).filter((f) => !SKIP.has(f.name));
  const blockField = fields.find((f) => f.type === "block");
  const titleField = blockField && fields.find((f) => f.name === "title");

  const meta = h("div", { class: "doc-meta" });
  function drawMeta() {
    if (!titleField) return;
    const bits = [];
    if (data.date) {
      const d = new Date(String(data.date).slice(0, 10) + "T12:00:00");
      if (!isNaN(d)) bits.push(d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
    }
    if (Array.isArray(data.tags) && data.tags.length) bits.push(data.tags.join(", "));
    if (data.draft) bits.push("draft");
    fill(meta, bits.flatMap((b, i) => (i ? [h("span", { "aria-hidden": "true" }, "·"), b] : [b])));
  }

  let blocksEl = null;
  const doc = h("div", { class: "doc" });
  if (titleField) {
    const title = autosize(h("textarea", { class: "doc-title", rows: 1, placeholder: "Title", "aria-label": "Title", value: data.title ?? "",
      oninput: () => { data.title = title.value.replace(/\n/g, " "); changed(); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); doc.querySelector(".block textarea")?.focus(); } } }));
    doc.append(title, meta);
    drawMeta();
  }
  if (blockField) {
    blocksEl = renderField(blockField, data, ctx);
    doc.append(blocksEl);
  } else {
    // a page without blocks: its fields, in grouped cards
    doc.classList.add("doc-form");
    doc.append(h("h1", { class: "doc-heading" }, config.sections.find((s) => s.path === file)?.label || data.title || file));
    for (const f of fields) { const el = renderField(f, data, ctx); if (el) doc.append(h("div", { class: "group" }, el)); }
  }

  // ----- the inspector -----
  const inspector = h("div", { class: "inspector-body" });
  if (blockField) {
    let rows = null; // consecutive date / switch fields share one card
    for (const f of fields) {
      if (f === blockField || f === titleField) continue;
      const el = renderField(f, data, ctx);
      if (!el) continue;
      if (ROW_TYPES.has(f.type)) {
        el.classList.add("row");
        if (!rows) { rows = h("div", { class: "group rows" }); inspector.append(rows); }
        rows.append(el);
      } else {
        rows = null;
        inspector.append(h("div", { class: "group-wrap" },
          h("div", { class: "group-label" }, el.querySelector(".field-label")?.textContent || f.label || f.name),
          h("div", { class: "group" + (f.type === "image" ? " image-group" : "") }, el)));
      }
    }
  } else {
    inspector.append(h("p", { class: "muted small inspector-empty" }, "This page's fields are all in the document."));
  }
  const url = entry.url || guessPageUrl(file);
  inspector.append(h("div", { class: "group-wrap" }, h("div", { class: "group-label" }, "Address"), h("div", { class: "address" }, url)));

  // ⌘S saves straight away
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); pending = true; save(); } };
  document.addEventListener("keydown", onKey);
  // closing the tab with a save still waiting: send it anyway
  const onLeave = () => {
    if (!pending) return;
    fetch("/api/entry", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file, data, body: entry.body }) });
  };
  window.addEventListener("pagehide", onLeave);

  return {
    file, url, section,
    get title() { return data.title || config.sections.find((s) => s.path === file)?.label || file; },
    data, body: entry.body,
    doc, inspector,
    blocks: blocksEl?.api || null,
    status: () => statusText,
    onStatus: (fn) => statusListeners.add(fn),
    onChange: (fn) => changeListeners.add(fn),
    flush: () => { pending = pending || failed; return save(); },
    isChanged: () => JSON.stringify({ data, body: entry.body }) !== original,
    async revert() {
      if (!(await confirmBox("Put this back the way it was when you opened it? Your changes since then will be lost.", "Revert"))) return false;
      const was = JSON.parse(original);
      clearTimeout(timer); pending = false;
      await api.save(file, was.data, was.body);
      return true;
    },
    async remove() {
      if (!(await confirmBox(`Move "${data.title || file}" to the Trash? It goes into the .cms-trash folder in your site, so you can get it back.`, "Move to Trash"))) return false;
      clearTimeout(timer); pending = false;
      await api.remove(file);
      toast("Moved to .cms-trash");
      return true;
    },
    destroy: () => { document.removeEventListener("keydown", onKey); window.removeEventListener("pagehide", onLeave); },
  };
}

// pages kept in data files (home.json, about.json): which page shows them
function guessPageUrl(file) {
  const name = (file.match(/([^/]+)\.json$/) || [])[1];
  if (!name) return "/";
  return name === "home" || name === "index" ? "/" : `/${name}/`;
}
