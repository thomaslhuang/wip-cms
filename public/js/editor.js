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

function localOffset() {
  const off = -new Date().getTimezoneOffset(), pad = (n) => String(n).padStart(2, "0");
  return (off >= 0 ? "+" : "-") + pad(Math.floor(Math.abs(off) / 60)) + ":" + pad(Math.abs(off) % 60);
}
import { api } from "./api.js";
import { renderField } from "./fields.js";
import { t, t2, tl, fmtDate } from "./i18n.js";

import { saveAfter } from "./settings.js";   // seconds after the last change before saving (Settings → Save after)
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

  const fields = ((section ? section.fields : config.sections.find((s) => s.path === file)?.fields) || []).filter((f) => !SKIP.has(f.name));
  // a field called "body" is the text under the --- front matter --- (the Pages CMS convention)
  const hasBody = fields.some((f) => f.name === "body");
  if (hasBody) data.body = entry.body || "";
  const payload = () => {
    if (!hasBody) return { data, body: entry.body };
    const { body, ...rest } = data;
    return { data: rest, body: body || "" };
  };
  const original = JSON.stringify(payload());
  // list items: a fingerprint of what's in the file, sent with each save so it can't land on
  // the wrong item if the list changed somewhere else (lib/listfile.js)
  let version = entry.version;

  // ----- saving -----
  let pending = false, saving = null, timer = null, failed = false;
  const changeListeners = new Set(), statusListeners = new Set();
  let statusText = "Saved";
  const setStatus = (t) => { statusText = t; statusListeners.forEach((fn) => fn(t)); };

  // required fields (required: true in .pages.yml): it doesn't save while one is empty, and
  // says which (the field is outlined in red until it's filled in)
  const isEmpty = (v) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
  let lastMissing = "";
  function checkRequired() {
    const missing = fields.filter((f) => f.required && !f.hidden && isEmpty(data[f.name]));
    for (const el of [doc, inspector]) {
      el.querySelectorAll(".field.missing").forEach((x) => x.classList.remove("missing"));
      el.querySelectorAll(".field-help.required-note").forEach((x) => x.remove());
      for (const f of missing) {
        const fe = el.querySelector(`.field[data-name="${CSS.escape(f.name)}"]`);
        if (!fe) continue;
        fe.classList.add("missing");
        fe.append(h("p", { class: "field-help warn required-note" }, t("This needs filling in before your changes can be saved.")));
      }
    }
    doc.querySelector(".doc-title")?.classList.toggle("missing", missing.some((f) => f.name === primary));
    const names = missing.map((f) => tl(f.label || f.name)).join(", ");
    if (names && names !== lastMissing) toast(t("Not saved: {fields} can't be empty.", { fields: names }), "error");
    lastMissing = names;
    return !missing.length;
  }

  async function save() {
    clearTimeout(timer);
    if (!pending) return saving;
    if (saving) { await saving; return save(); }
    if (!checkRequired()) { setStatus("Not saved"); return saving; }
    pending = false;
    setStatus("Saving…");
    const p = payload();
    saving = api.save(file, p.data, p.body, version)
      .then((saved) => {
        if (saved?.version) version = saved.version;
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
    timer = setTimeout(save, saveAfter() * 1000);
    changeListeners.forEach((fn) => fn());
    drawMeta();
  };

  // the post's own image folder: uploads go there, and the picker opens there
  const imageFolder = section
    ? (await api.imageFolder(file)).folder
    : `${config.site.mediaInput}/${(file.match(/([^/]+)\.json$/) || [, ""])[1]}`.replace(/\/$/, "");
  // entry: the post's own values, for image folders named after it (src/img/projects/{slug})
  // slugGuard: a list item's permalink (its "slug"), which warns when you change it
  const ctx = { changed, imageFolder, tags: config.tags, entry: data, slugGuard: section?.store === "list" };

  // ----- the document -----
  // the document's main part: the blocks, or else the body text of a plain post, or else (for
  // posts kept in a data file) its first long text field, like a project's description
  const blockField = fields.find((f) => f.type === "block") || (hasBody ? fields.find((f) => f.name === "body") : null)
    || (section ? fields.find((f) => f.type === "rich-text") : null);
  // the big title: whichever field names the post (title, or the section's view.primary)
  const primary = section?.primary || "title";
  // (a single page with a title and text, like a Markdown page, gets one too)
  const titleField = (section || blockField) && fields.find((f) => f.name === primary && (!f.type || f.type === "string"));
  // also in the document rather than the inspector: a long title, and galleries (several
  // images, or a list of pictures with captions)
  const subtitleField = titleField && fields.find((f) => ["longTitle", "subtitle", "fullTitle"].includes(f.name) && f.type === "string");
  // A full title (a field called longTitle or fullTitle: a longer version of the title, which
  // a site shows as the heading of the post's own page) is the big heading here too, with
  // the short title under it. Without one, the heading shows the short title, in gray, the
  // way the page falls back to it.
  const fullField = subtitleField && ["longTitle", "fullTitle"].includes(subtitleField.name) ? subtitleField : null;
  const isGallery = (f) => (f.type === "image" && f.options?.multiple) || (f.type === "object" && f.list && (f.fields || []).some((x) => x.type === "image"));
  const galleryFields = section ? fields.filter(isGallery) : [];

  // under the title: the date, draft and tags, each editable right there
  const meta = h("div", { class: "doc-meta" });
  const has = (name) => fields.some((f) => f.name === name);
  function drawMeta(force) {
    if (!titleField) return;
    // don't redraw while you're typing a tag in it, or while its date picker is open: a new
    // input would close the calendar after every change (so going back several years took a
    // fresh click each time). Then only the date shown beside the calendar icon is updated.
    const active = document.activeElement;
    if (!force && meta.contains(active) && active.tagName === "INPUT") {
      if (active.classList.contains("meta-date-input")) {
        const d = active.value ? new Date(active.value + "T12:00:00") : null;
        const label = active.parentElement.querySelector(":scope > span:not(.icon)");
        if (label && d && !isNaN(d)) label.textContent = fmtDate(d, "long");
      }
      return;
    }
    const parts = [];
    const dateName = (fields.find((f) => f.name === "date" && f.type === "date") || fields.find((f) => f.type === "date"))?.name;
    if (dateName) {
      const d = data[dateName] ? new Date(String(data[dateName]).slice(0, 10) + "T12:00:00") : null;
      const picker = h("input", { type: "date", class: "meta-date-input", "aria-label": t("Date"), value: data[dateName] ? String(data[dateName]).slice(0, 10) : "",
        onchange: () => {
          if (!picker.value) return;
          const rest = /^\d{4}-\d{2}-\d{2}(T.*)$/.exec(String(data[dateName] || ""));
          data[dateName] = picker.value + (rest ? rest[1] : "T00:00:00" + localOffset());
          changed(); refreshInspector();
        } });
      picker.addEventListener("click", () => { try { picker.showPicker(); } catch { /* opens by itself */ } });
      parts.push(h("label", { class: "meta-date", title: t("Change the date") },
        icon("calendar"), h("span", {}, d && !isNaN(d) ? fmtDate(d, "long") : t("Add a date")), picker));
    }
    if (has("draft")) {
      parts.push(h("button", { class: "meta-status " + (data.draft ? "is-draft" : "is-live"), "aria-pressed": String(!!data.draft),
        title: data.draft ? t("A draft: not on the site. Click to publish it when you next push.") : t("On the site. Click to make it a draft."),
        onclick: () => { data.draft = !data.draft; changed(); refreshInspector(); } },
        h("span", { class: "meta-dot", "aria-hidden": "true" }), data.draft ? t("Draft") : t("Published")));
    }
    if (has("tags")) {
      if (!Array.isArray(data.tags)) data.tags = data.tags ? [data.tags] : [];
      const tags = data.tags;
      const suggestions = [...new Set([...(fields.find((f) => f.name === "tags")?.options?.values || []).map((v) => (typeof v === "object" ? String(v.value) : String(v))), ...(config.tags || [])])];
      const listId = "meta-tags-" + Math.random().toString(36).slice(2);
      const adder = h("input", { class: "meta-tag-input", list: listId, placeholder: t("add tag"), "aria-label": t("Add a tag"), size: 7 });
      const add = (raw) => {
        const v = raw.trim();
        if (!v) return;
        const existing = suggestions.find((x) => x.toLowerCase() === v.toLowerCase()) || v; // keep the spelling you already use
        if (!tags.some((t) => t.toLowerCase() === existing.toLowerCase())) { tags.push(existing); changed(); refreshInspector(); }
        adder.value = "";
      };
      adder.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(adder.value); drawMeta(true); meta.querySelector(".meta-tag-input")?.focus(); }
        if (e.key === "Backspace" && !adder.value && tags.length) { tags.pop(); changed(); refreshInspector(); drawMeta(true); meta.querySelector(".meta-tag-input")?.focus(); }
        if (e.key === "Escape") adder.blur();
      });
      adder.addEventListener("change", () => { if (suggestions.includes(adder.value)) { add(adder.value); drawMeta(true); meta.querySelector(".meta-tag-input")?.focus(); } });
      adder.addEventListener("blur", () => { if (adder.value.trim()) { add(adder.value); } setTimeout(() => { if (!meta.contains(document.activeElement)) drawMeta(true); }, 0); });
      parts.push(h("span", { class: "meta-tags" },
        tags.map((tag, i) => h("span", { class: "meta-tag" }, tag,
          h("button", { class: "meta-tag-x", "aria-label": t("Remove tag {tag}", { tag }), onclick: () => { tags.splice(i, 1); changed(); refreshInspector(); drawMeta(true); } }, "×"))),
        adder,
        h("datalist", { id: listId }, suggestions.filter((x) => !tags.includes(x)).map((x) => h("option", { value: x })))));
    }
    fill(meta, parts);
  }

  let blocksEl = null;
  const doc = h("div", { class: "doc" });
  if (titleField && fullField) {
    const shortLabel = tl(titleField.label || "Short title");
    const heading = autosize(h("textarea", { class: "doc-title full-heading", rows: 1, "aria-label": tl(fullField.label || fullField.name),
      placeholder: data[primary] || tl(fullField.label || fullField.name), value: data[fullField.name] ?? "",
      title: t("The title on its own page. Leave it empty to use the short title."),
      oninput: () => { data[fullField.name] = heading.value.replace(/\n/g, " "); changed(); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); short.focus(); } } }));
    const short = autosize(h("textarea", { class: "doc-subtitle", rows: 1, "aria-label": shortLabel, placeholder: shortLabel, value: data[primary] ?? "",
      oninput: () => { data[primary] = short.value.replace(/\n/g, " "); heading.placeholder = data[primary] || tl(fullField.label || fullField.name); changed(); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); doc.querySelector(".block .rich-box:not([hidden]), .block textarea:not([hidden]), .doc-body .rich-box:not([hidden]), .doc-body textarea")?.focus(); } } }));
    doc.append(heading, h("label", { class: "doc-short" }, h("span", { class: "doc-short-label" }, shortLabel), short), meta);
    drawMeta();
  } else if (titleField) {
    const title = autosize(h("textarea", { class: "doc-title", rows: 1, placeholder: t("Title"), "aria-label": t("Title"), value: data[primary] ?? "",
      oninput: () => { data[primary] = title.value.replace(/\n/g, " "); changed(); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); doc.querySelector(".block .rich-box:not([hidden]), .block textarea:not([hidden]), .doc-body .rich-box:not([hidden]), .doc-body textarea")?.focus(); } } }));
    doc.append(title);
    // a longer title (projects' "full title") sits right under the title, as a subtitle
    if (subtitleField) {
      const sub = autosize(h("textarea", { class: "doc-subtitle", rows: 1, "aria-label": subtitleField.label || subtitleField.name,
        placeholder: t("{label} (optional)", { label: tl(subtitleField.label || subtitleField.name) }), value: data[subtitleField.name] ?? "",
        oninput: () => { data[subtitleField.name] = sub.value.replace(/\n/g, " "); changed(); },
        onkeydown: (e) => { if (e.key === "Enter") e.preventDefault(); } }));
      doc.append(sub);
    }
    doc.append(meta);
    drawMeta();
  }
  if (blockField || titleField) {
    if (blockField) {
      blocksEl = renderField(blockField, data, ctx);
      if (blockField.type !== "block") {
        // plain body text: written straight into the page, like a text block
        blocksEl.classList.add("doc-body");
        blocksEl.querySelector(".field-label")?.remove();
      }
      doc.append(blocksEl);
    }
    // big picture content (a project's gallery) belongs with the writing, not in the inspector
    for (const f of galleryFields) {
      const el = renderField(f, data, ctx);
      el?.querySelector(":scope > .field-label")?.remove();
      if (el) doc.append(h("section", { class: "doc-gallery" },
        h("div", { class: "doc-section-head" }, h("span", {}, tl(f.label || f.name)), Array.isArray(data[f.name]) ? h("span", { class: "muted" }, t2(data[f.name].length, "{n} item", "{n} items")) : null),
        el));
    }
    // nothing long to write and no gallery (a printed-matter item: a picture and a caption):
    // its fields go in the document, under the title
    if (!blockField && !galleryFields.length) {
      for (const f of fields) {
        if (f === titleField || f === subtitleField) continue;
        const el = renderField(f, data, ctx);
        if (el) doc.append(h("div", { class: "group doc-field" }, el));
      }
    }
  } else {
    // a page without blocks: its fields, in grouped cards
    doc.classList.add("doc-form");
    doc.append(h("h1", { class: "doc-heading" }, config.sections.find((s) => s.path === file)?.label || data[primary] || data.title || file));
    for (const f of fields) { if (section && f === titleField) continue; const el = renderField(f, data, ctx); if (el) doc.append(h("div", { class: "group" }, el)); }
  }

  // ----- the inspector -----
  // (rebuilt when the date, draft or tags change under the title, so both show the same)
  const inspector = h("div", { class: "inspector-body" });
  // list items with no page of their own (a list of stockists) have no address
  const url = entry.url || (section?.store === "list" ? null : guessPageUrl(file));
  function refreshInspector() {
  const scroll = inspector.parentNode?.scrollTop;
  fill(inspector);
  if (blockField || galleryFields.length) {
    let rows = null; // consecutive date / switch fields share one card
    for (const f of fields) {
      if (f === blockField || f === titleField || f === subtitleField || galleryFields.includes(f)) continue;
      const el = renderField(f, data, ctx);
      if (!el) continue;
      if (ROW_TYPES.has(f.type)) {
        el.classList.add("row");
        if (!rows) { rows = h("div", { class: "group rows" }); inspector.append(rows); }
        rows.append(el);
      } else {
        rows = null;
        inspector.append(h("div", { class: "group-wrap" },
          h("div", { class: "group-label" }, el.querySelector(".field-label")?.textContent || tl(f.label || f.name)),
          h("div", { class: "group" + (f.type === "image" ? " image-group" : "") }, el)));
      }
    }
  } else {
    inspector.append(h("p", { class: "muted small inspector-empty" }, t("This page's fields are all in the document.")));
  }
  // (a list item whose "slug" field is shown above already has its permalink there)
  if (url && !(section?.store === "list" && fields.some((f) => f.name === "slug"))) inspector.append(h("div", { class: "group-wrap" }, h("div", { class: "group-label" }, t("Permalink")), h("div", { class: "address" }, url)));
  if (scroll && inspector.parentNode) inspector.parentNode.scrollTop = scroll;
  }
  refreshInspector();

  // ⌘S saves straight away
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); pending = true; save(); } };
  document.addEventListener("keydown", onKey);
  // closing the tab with a save still waiting: send it anyway
  const onLeave = () => {
    if (!pending) return;
    fetch("/api/entry", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file, ...payload(), version }) });
  };
  window.addEventListener("pagehide", onLeave);

  return {
    file, url, section,
    get title() { return (fullField && data[fullField.name]) || data[primary] || data.title || config.sections.find((s) => s.path === file)?.label || file; },
    data, payload,
    doc, inspector,
    redrawMeta: () => drawMeta(true),
    blocks: blocksEl?.api || null,  // only block fields have one
    status: () => statusText,
    onStatus: (fn) => statusListeners.add(fn),
    onChange: (fn) => changeListeners.add(fn),
    flush: () => { pending = pending || failed; return save(); },
    isChanged: () => JSON.stringify(payload()) !== original,
    async revert() {
      if (!(await confirmBox(t("Put this back the way it was when you opened it? Your changes since then will be lost."), t("Revert")))) return false;
      const was = JSON.parse(original);
      clearTimeout(timer); pending = false;
      const saved = await api.save(file, was.data, was.body, version);
      if (saved?.version) version = saved.version;
      return true;
    },
    async remove() {
      if (!(await confirmBox(t("Move “{title}” to the Trash? It goes into the .cms-trash folder in your site, so you can get it back.", { title: data[primary] || data.title || file }), t("Move to Trash")))) return false;
      clearTimeout(timer); pending = false;
      await api.remove(file);
      toast(t("Moved to .cms-trash"));
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
