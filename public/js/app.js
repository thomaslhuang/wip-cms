// The app: the window's columns, the toolbar, and opening things.
//
//   sidebar    sections (blog posts, projects), Images, pages and settings
//   list       the posts in the chosen section, newest first, grouped by month
//   toolbar    the open post's title and save state; Write / Split / Preview; insert,
//              photos, rearrange, open on site, show/hide the inspector; the ⋯ menu
//   docpane    the post as a document (editor.js)
//   preview    the real site, updating as you type (lib/preview.js)
//   inspector  the post's details (editor.js)
//
// On a phone-sized window only one column shows at a time, with back buttons.
// The address says what's open, so reloading keeps your place:
//   #/s/blog         the blog posts list
//   #/edit/<file>    a post or page
//   #/images         the image library
import { h, fill, icon, toast } from "./util.js";
import { api } from "./api.js";
import { openEditor } from "./editor.js";
import { libraryBrowser, setMediaRoot } from "./media.js";
import { openSetup } from "./setup.js";
import { t, t2, fmtDate, lang, setLang, dateStyle, setDateStyle } from "./i18n.js";
import { applyTheme, setMode as setTheme, mode as theme, openAppearance } from "./theme.js";

applyTheme();

const $ = (id) => document.getElementById(id);
const app = $("app"), sidebarEl = $("sidebar"), listEl = $("list"), toolbarEl = $("toolbar");
const docpane = $("docpane"), previewpane = $("previewpane"), inspectorEl = $("inspector"), stage = $("stage"), phonebar = $("phonebar");

let config;
let editor = null;          // the open post/page (editor.js), if any
let route = { page: "", section: null, file: null };
const lists = {};           // section name -> its posts (from the server)
let filter = "";

// ---------- remembered settings ----------

const pref = {
  get: (k, d) => { try { const v = localStorage.getItem("wip-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("wip-" + k, JSON.stringify(v)); } catch { /* private window */ } },
};
let view = pref.get("view", "write");                 // write | split | preview
let showSidebar = pref.get("sidebar", true);
let showInspector = pref.get("inspector", true);
let splitAt = pref.get("split", 0.5);                 // share of the width for writing in Split
let previewSize = pref.get("preview-size", "full");   // full | phone
const narrow = () => window.matchMedia("(max-width: 760px)").matches;


// ---------- small pieces ----------

const tbtn = (name, label, onclick, extra = {}) => h("button", { class: "tbtn" + (extra.on ? " on" : "") + (extra.cls ? " " + extra.cls : ""), "aria-label": label, title: label, onclick, disabled: extra.disabled }, icon(name));
const segmented = (label, options, current, onpick) => h("div", { class: "segmented", role: "group", "aria-label": label },
  options.map(([value, text]) => h("button", { class: value === current ? "on" : "", "aria-pressed": String(value === current), onclick: () => onpick(value) }, text)));

function popMenu(anchor, items) {
  document.querySelector(".popmenu")?.remove();
  const r = anchor.getBoundingClientRect();
  const menu = h("div", { class: "popmenu", role: "menu", style: { top: r.bottom + 6 + "px", right: Math.max(8, window.innerWidth - r.right) + "px" } },
    items.map((it) => it === "-" ? h("div", { class: "popmenu-sep" })
      : it.heading ? h("div", { class: "popmenu-heading" }, it.heading)
      : h("button", { role: "menuitem", class: it.danger ? "danger" : "", onclick: () => { menu.remove(); it.run(); } },
          h("span", { class: "popmenu-check" }, it.checked ? icon("check") : null), it.label)));
  document.body.append(menu);
  setTimeout(() => document.addEventListener("pointerdown", function close(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("pointerdown", close); } }), 0);
}

// ---------- sidebar ----------

let changesCount = null;
async function refreshChanges() {
  try { changesCount = (await api.changes()).count; } catch { changesCount = null; }
  drawSidebar();
}

function drawSidebar() {
  const collections = config.sections.filter((s) => s.kind === "collection");
  const groups = {};
  config.sections.filter((s) => s.kind !== "collection").forEach((s) => (groups[s.group || "settings"] ||= []).push(s));
  const item = (href, iconName, label, count, active) => h("a", { class: "side-item" + (active ? " active" : ""), href },
    icon(iconName, "side-icon"), h("span", { class: "side-label" }, label), count != null ? h("span", { class: "side-count" }, count) : null);
  fill(sidebarEl,
    h("div", { class: "side-head" },
      h("button", { class: "site-btn", title: t("Open another site"), onclick: () => chooseSite(true) }, h("span", {}, config.site.name), icon("chevrons")),
      tbtn("sidebar", t("Hide sidebar"), () => toggleSidebar(), { cls: "side-hide" })),
    h("nav", { class: "side-scroll" },
      h("div", { class: "side-group" }, t("Library")),
      collections.map((s) => item("#/s/" + s.name, s.name === "projects" ? "grid" : "text", t(s.label), lists[s.name]?.length, route.section === s.name)),
      item("#/images", "images", t("Images"), null, route.page === "images"),
      Object.entries(groups).map(([g, items]) => [
        h("div", { class: "side-group" }, lang() === "ja" ? t(g) : g[0].toUpperCase() + g.slice(1)),
        items.map((s) => item("#/edit/" + s.path, g === "pages" ? (s.name === "home" ? "house" : "text") : "gear", t(s.label), null, route.file === s.path)),
      ])),
    h("div", { class: "side-foot" },
      changesCount == null ? null : h("span", { class: "dot" + (changesCount ? " on" : "") }),
      changesCount == null ? "" : changesCount ? t2(changesCount, "{n} change ready to publish", "{n} changes ready to publish") : t("Everything is published")));
}

// ---------- the post list ----------

const asDate = (d) => new Date(String(d).slice(0, 10) + "T12:00:00");

async function loadList(name, force) {
  if (!lists[name] || force) lists[name] = await api.list(name);
  return lists[name];
}

// which years and months are folded away, remembered for each section
const folded = pref.get("list-folded", {});
const isFolded = (section, key) => (folded[section] || []).includes(key);
function toggleFold(section, key) {
  const set = new Set(folded[section] || []);
  set.has(key) ? set.delete(key) : set.add(key);
  folded[section] = [...set];
  pref.set("list-folded", folded);
  drawList();
}

function drawList() {
  const s = config.sections.find((x) => x.name === route.section && x.kind === "collection");
  app.classList.toggle("no-list", !s);
  if (!s) return fill(listEl);
  const all = lists[s.name] || [];
  const shown = all.filter((e) => !filter || (e.title + " " + (e.excerpt || "")).toLowerCase().includes(filter));
  const drafts = all.filter((e) => e.draft).length;
  const mode = listMode(s.name);
  const items = { rows: rowItem, grid: tileItem, text: textItem }[mode];

  // years, then (except in the grid) months inside them; each can be folded away.
  // While searching everything is open, so nothing that matches is hidden.
  const years = [];
  for (const e of shown) {
    const d = e.date ? asDate(e.date) : null;
    const yKey = d ? String(d.getFullYear()) : "none";
    const mKey = d ? `${yKey}-${String(d.getMonth() + 1).padStart(2, "0")}` : "none";
    let y = years[years.length - 1];
    if (!y || y.key !== yKey) years.push(y = { key: yKey, date: d, months: [], count: 0 });
    let m = y.months[y.months.length - 1];
    if (!m || m.key !== mKey) y.months.push(m = { key: mKey, date: d, entries: [] });
    m.entries.push(e);
    y.count++;
  }
  const open = (key) => filter || !isFolded(s.name, key);
  const head = (key, label, count, level) => h("button", { class: `tree-head ${level}`, "aria-expanded": String(open(key)), onclick: () => toggleFold(s.name, key) },
    icon("chevron", "tree-chev"), h("span", { class: "tree-label" }, label), h("span", { class: "tree-count" }, count));
  const rows = years.map((y) => h("div", { class: "tree-year" },
    head(y.key, y.date ? fmtDate(y.date, "year") : t("No date"), y.count, "year"),
    !open(y.key) ? null
      : mode === "grid" || !y.date ? h("div", { class: "list-items " + mode }, y.months.flatMap((m) => m.entries).map(items))
      : h("div", { class: "tree-body" }, y.months.map((m) => h("div", { class: "tree-month" },
          head(m.key, fmtDate(m.date, "monthName"), m.entries.length, "month"),
          open(m.key) ? h("div", { class: "list-items " + mode }, m.entries.map(items)) : null)))));

  const search = h("input", { class: "search-input", type: "search", placeholder: t("Search"), "aria-label": t("Search {label}", { label: t(s.label) }), value: filter,
    oninput: () => { filter = search.value.toLowerCase(); drawList(); const el = listEl.querySelector(".search-input"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  fill(listEl,
    h("div", { class: "list-head" },
      h("a", { class: "tbtn back-btn", href: "#/", "aria-label": t("Sections") }, icon("back")),
      h("div", { class: "list-title" }, h("div", { class: "list-name" }, t(s.label)),
        h("div", { class: "list-count" }, t2(all.length, "{n} item", "{n} items") + (drafts ? t2(drafts, ", {n} draft", ", {n} drafts") : ""))),
      tbtn("compose", t("New in {label}", { label: t(s.label) }), () => newEntry(s))),
    h("div", { class: "list-tools" },
      h("label", { class: "search" }, icon("search"), search),
      segmentedIcons(t("Show as"), [["rows", "rows", t("List")], ["grid", "grid", t("Grid")], ["text", "text", t("Titles only")]], mode, (m) => setListMode(s.name, m))),
    h("div", { class: "list-scroll" }, rows.length ? rows : h("p", { class: "muted list-empty" }, filter ? t("Nothing matches.") : t("Nothing here yet."))),
    h("div", { class: "list-resize", role: "separator", "aria-label": t("Resize list"), onpointerdown: resizeList }));
}

// three ways to show a section, remembered for each one: list (picture, title, first
// words), grid (pictures only, three across), titles only
const listModes = pref.get("list-modes", {});
const listMode = (name) => listModes[name] || "rows";
function setListMode(name, mode) { listModes[name] = mode; pref.set("list-modes", listModes); drawList(); }
const segmentedIcons = (label, options, current, onpick) => h("div", { class: "segmented icons", role: "group", "aria-label": label },
  options.map(([value, ic, text]) => h("button", { class: value === current ? "on" : "", "aria-pressed": String(value === current), "aria-label": text, title: text, onclick: () => onpick(value) }, icon(ic))));

const isActive = (e) => (route.file === e.file ? " active" : "");
const titleOf = (e) => (e.isBook ? h("i", {}, e.title) : e.title);
const draftBadge = (e) => (e.draft ? h("span", { class: "badge" }, t("Draft")) : null);
function rowItem(e) {
  return h("a", { class: "row-item" + isActive(e), href: "#/edit/" + e.file },
    e.featuredImage ? h("img", { class: "row-thumb", src: e.featuredImage, alt: "", loading: "lazy" }) : h("span", { class: "row-thumb empty" }),
    h("span", { class: "row-text" },
      h("span", { class: "row-title" }, titleOf(e)),
      h("span", { class: "row-sub" }, e.date ? fmtDate(e.date, "day") : "", draftBadge(e)),
      e.excerpt ? h("span", { class: "row-excerpt" }, e.excerpt) : null));
}
// the grid: square pictures edge to edge; the title shows when you point at one
function tileItem(e) {
  return h("a", { class: "tile" + isActive(e) + (e.featuredImage ? "" : " no-pic"), href: "#/edit/" + e.file, title: e.title, "aria-label": e.title },
    e.featuredImage ? h("img", { src: e.featuredImage, alt: "", loading: "lazy" }) : null,
    h("span", { class: "tile-title" }, titleOf(e)),
    draftBadge(e));
}
function textItem(e) {
  return h("a", { class: "text-item" + isActive(e), href: "#/edit/" + e.file },
    h("span", { class: "text-title" }, titleOf(e)), draftBadge(e),
    h("span", { class: "text-date" }, e.date ? fmtDate(e.date, "day") : ""));
}

// drag the list's right edge to make it wider (handy for the grid)
let listWidth = pref.get("list-width", 300);
listEl.style.width = listWidth + "px";
function resizeList(e) {
  e.preventDefault();
  const startX = e.clientX, startW = listEl.offsetWidth;
  app.classList.add("resizing");
  const move = (ev) => { listWidth = Math.min(640, Math.max(240, startW + ev.clientX - startX)); listEl.style.width = listWidth + "px"; };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); app.classList.remove("resizing"); pref.set("list-width", listWidth); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// the same rule as the server's (lib/entries.js): lower case, letters and numbers, dashes between
const slugify = (t) => String(t || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function newEntry(section) {
  const singular = lang() === "ja" ? t(section.label) : section.label.replace(/s$/, "").replace(/ posts?$/, " post").toLowerCase();
  // where it will live on the site: the section's folder (inside the site's pages folder) plus
  // its filename template, e.g. blog/{year}/{month}/<permalink>/
  const now = new Date();
  const root = config.site.contentRoot === "." ? "" : config.site.contentRoot + "/";
  const base = "/" + (section.path.startsWith(root) ? section.path.slice(root.length) : section.path) + "/" +
    (section.filename || "{primary}/index.md").replace("{year}", now.getFullYear()).replace("{month}", String(now.getMonth() + 1).padStart(2, "0")).replace(/\{primary\}\/index\.md$/, "").replace(/\{primary\}.*$/, "");
  let edited = false;
  const title = h("input", { class: "field-input", placeholder: t("Title"), "aria-label": t("Title"), oninput: () => { if (!edited) link.value = slugify(title.value); } });
  const link = h("input", { class: "field-input permalink-input", placeholder: t("made from the title"), "aria-label": t("Permalink"),
    oninput: () => { edited = link.value.trim() !== ""; },
    onblur: () => { link.value = slugify(link.value); if (!link.value) { edited = false; link.value = slugify(title.value); } } });
  const go = async () => {
    const name = title.value.trim();
    if (!name) return title.focus();
    overlay.remove();
    try {
      const created = await api.create(section.name, name, slugify(link.value) || slugify(name));
      await loadList(section.name, true);
      location.hash = "#/edit/" + created.file;
    } catch (e) { toast(e.message, "error"); }
  };
  for (const el of [title, link]) el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") overlay.remove(); });
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h("div", { class: "dialog" }, h("p", { class: "dialog-title" }, t("New {kind}", { kind: singular })),
      title,
      h("label", { class: "permalink" }, h("span", { class: "field-label" }, t("Permalink")),
        h("span", { class: "permalink-row" }, h("span", { class: "permalink-base" }, base), link, h("span", { class: "permalink-base" }, "/"))),
      h("p", { class: "muted small" }, t("The permalink follows the title unless you change it. New posts start as drafts.")),
      h("div", { class: "dialog-buttons" }, h("button", { class: "btn", onclick: () => overlay.remove() }, t("Cancel")), h("button", { class: "btn primary", onclick: go }, t("Create")))));
  document.body.append(overlay);
  title.focus();
}

// ---------- toolbar ----------

let statusEl = null;
function drawToolbar() {
  const left = [];
  if (narrow()) left.push(h("a", { class: "tbtn", href: route.section ? "#/s/" + route.section : "#/", "aria-label": t("Back") }, icon("back")));
  else if (!showSidebar) left.push(tbtn("sidebar", t("Show sidebar"), () => toggleSidebar()));
  statusEl = h("div", { class: "doc-status" }, editor ? t(editor.status()) : "");
  const title = h("div", { class: "toolbar-title" },
    h("div", { class: "toolbar-name" }, route.page === "images" ? t("Images") : editor ? editor.title : ""), editor ? statusEl : null);

  const right = [];
  const v = currentView();
  if (editor) {
    const b = editor.blocks;
    if (b && v !== "preview" && !narrow()) {
      right.push(tbtn("insert", t("Insert a block"), () => b.insert()));
      if (b.hasPhotos()) right.push(tbtn("images", t("Add photos"), () => b.addPhotos()));
      right.push(tbtn("arrows", b.isRearranging() ? t("Done rearranging") : t("Rearrange blocks"), () => b.toggleRearrange(), { on: b.isRearranging() }));
    }
    if (!narrow()) right.push(h("a", { class: "tbtn", href: `http://localhost:${config.preview.port}${editor.url}`, target: "_blank", rel: "noopener", "aria-label": t("Open on your site"), title: t("Open on your site (new tab)") }, icon("external")));
    right.push(tbtn(narrow() ? "info" : "inspector", showInspector ? t("Hide details") : t("Show details"), () => toggleInspector(), { on: showInspector && !narrow() }));
  }
  const more = tbtn("more", t("More"), () => popMenu(more, [
    ...(editor ? [
      { label: t("Revert to when opened"), run: async () => { if (await editor.revert()) reopen(); } },
      ...(editor.section ? [{ label: t("Move to Trash"), danger: true, run: async () => {
        const section = editor.section.name;
        if (await editor.remove()) { editor.destroy(); editor = null; await loadList(section, true); location.hash = "#/s/" + section; }
      } }] : []),
      "-",
    ] : []),
    { heading: t("Appearance") },
    ...[["system", t("Match my Mac")], ["light", t("Light")], ["dark", t("Dark")]].map(([m, label]) => ({ label, checked: theme() === m, run: () => setTheme(m) })),
    { label: t("Themes, colours and fonts…"), run: () => openAppearance() },
    "-",
    // the whole app in English or Japanese (reloads to switch)
    { heading: t("Language") },
    ...[["en", "English"], ["ja", "日本語"]].map(([l, label]) => ({ label, checked: lang() === l, run: async () => { if (lang() !== l) { await editor?.flush(); setLang(l); location.reload(); } } })),
    // how dates are written, shown with today's date as the example
    { heading: t("Dates") },
    ...["western", "japanese", "era"].map((style) => ({ label: fmtDate(new Date(), "long", style), checked: dateStyle() === style, run: () => { setDateStyle(style); drawList(); editor?.redrawMeta?.(); } })),
    "-",
    { label: t("Open another site…"), run: () => chooseSite(true) },
  ]));
  right.push(more);

  const views = editor ? segmented(t("View"), narrow() ? [["write", t("Write")], ["preview", t("Preview")]] : [["write", t("Write")], ["split", t("Split")], ["preview", t("Preview")]], v, setView) : null;
  fill(toolbarEl, h("div", { class: "toolbar-side" }, left, title), views, h("div", { class: "toolbar-side end" }, right));

  // phone: the most-used block actions float at the bottom
  const b = editor?.blocks;
  fill(phonebar, narrow() && b && v === "write" ? [
    b.hasPhotos() ? h("button", { "aria-label": t("Add photos"), onclick: () => b.addPhotos() }, icon("images")) : null,
    h("button", { "aria-label": t("Rearrange blocks"), class: b.isRearranging() ? "on" : "", onclick: () => b.toggleRearrange() }, icon("arrows")),
    h("button", { "aria-label": t("Insert a block"), class: "primary", onclick: () => b.insert() }, icon("plus")),
  ] : []);
}

const currentView = () => (narrow() && view === "split" ? "write" : view);
function setView(v) { view = v; pref.set("view", v); layout(); }
function toggleSidebar() { showSidebar = !showSidebar; pref.set("sidebar", showSidebar); layout(); }
function toggleInspector() { showInspector = !showInspector; if (!narrow()) pref.set("inspector", showInspector); layout(); }

// which columns show
function layout() {
  const v = editor ? currentView() : "write";
  app.dataset.view = v;
  app.classList.toggle("hide-sidebar", !showSidebar);
  app.classList.toggle("hide-inspector", !showInspector || !editor);
  // phone: one column at a time
  app.dataset.pane = route.page === "edit" || route.page === "images" ? "main" : route.page === "s" ? "list" : "nav";
  docpane.style.flex = v === "split" ? `${splitAt} 1 0` : "";
  previewpane.style.flex = v === "split" ? `${1 - splitAt} 1 0` : "";
  if (v !== "write") wirePreview();
  drawToolbar();
}

// drag the line between writing and preview
$("divider").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  app.classList.add("resizing");
  const move = (ev) => {
    splitAt = Math.min(0.75, Math.max(0.3, (ev.clientX - r.left) / r.width));
    docpane.style.flex = `${splitAt} 1 0`; previewpane.style.flex = `${1 - splitAt} 1 0`;
  };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); app.classList.remove("resizing"); pref.set("split", splitAt); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});

// ---------- preview ----------

const previewFrame = h("iframe", { class: "preview-frame", title: t("Live preview") });
const previewNote = h("span", { class: "preview-note" });
function drawPreviewBar() {
  fill(previewpane,
    h("div", { class: "preview-bar" },
      h("span", { class: "live-dot", "aria-hidden": "true" }), previewNote,
      h("div", { class: "segmented icons", role: "group", "aria-label": t("Preview size") },
        [["full", "laptop", t("Computer")], ["phone", "phone", t("Phone")]].map(([v, ic, label]) =>
          h("button", { class: v === previewSize ? "on" : "", "aria-label": label, title: label, onclick: () => { previewSize = v; pref.set("preview-size", v); drawPreviewBar(); } }, icon(ic)))),
      tbtn("refresh", t("Reload preview"), () => { if (previewFrame.dataset.url) previewFrame.src = previewFrame.dataset.url; })),
    h("div", { class: "preview-stage" + (previewSize === "phone" ? " phone" : "") }, previewFrame));
}
drawPreviewBar();

const LIVE = t("Live: shows changes as you type");
let draftTimer = null;
function wirePreview() {
  if (!editor) return;
  const url = `http://localhost:${config.preview.port}${editor.url}`;
  if (previewFrame.dataset.url !== url) { previewFrame.dataset.url = url; previewFrame.src = url; }
  previewNote.textContent = config.preview.status === "unavailable" ? config.preview.message
    : config.preview.status === "starting" ? t("Starting the preview…") : LIVE;
}
function watchForPreview(ed) {
  // the preview might still show edits from last time that were never saved: go back to the file
  api.discardDraft(ed.file).catch(() => {});
  ed.onChange(() => {
    clearTimeout(draftTimer);
    if (currentView() === "write") return; // saving a moment later updates the preview anyway
    previewNote.textContent = t("Updating…");
    draftTimer = setTimeout(async () => {
      try { const p = ed.payload(); await api.draft(ed.file, p.data, p.body); previewNote.textContent = LIVE; }
      catch (e) { previewNote.textContent = e.message; }
    }, 400);
  });
  ed.onStatus((st) => { if (statusEl) statusEl.textContent = t(st); if (st === "Saved") afterSave(); });
}
async function waitForPreview() {
  for (let i = 0; i < 60 && config.preview.status === "starting"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    config.preview = await api.preview();
  }
  if (editor && currentView() !== "write") { previewFrame.dataset.url = ""; wirePreview(); }
}

// ---------- after saving: keep the list and the publish count current ----------

let refreshTimer = null;
function afterSave() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (editor?.section) { await loadList(editor.section.name, true); drawList(); }
    const name = toolbarEl.querySelector(".toolbar-name");
    if (name && editor) name.textContent = editor.title;
    refreshChanges();
  }, 300);
}

// ---------- opening things ----------

function parseRoute() {
  const [, page = "", ...rest] = (location.hash || "").slice(1).split("/");
  const value = decodeURIComponent(rest.join("/"));
  if (page === "edit") {
    const section = config.sections.find((s) => s.kind === "collection" && value.startsWith(s.path + "/"));
    return { page, file: value, section: section ? section.name : null };
  }
  if (page === "s") return { page, section: value, file: null };
  if (page === "images") return { page, section: null, file: null };
  return { page: "", section: null, file: null };
}

async function go() {
  let next = parseRoute();
  // a computer screen with nothing chosen yet: show the first section
  if (!next.page && !narrow()) {
    const first = config.sections.find((s) => s.kind === "collection");
    if (first) { history.replaceState(null, "", "#/s/" + first.name); next = parseRoute(); }
  }
  // leaving a post: make sure it's saved
  if (editor && editor.file !== next.file) {
    await editor.flush();
    editor.destroy();
    editor = null;
  }
  route = next;
  if (route.section && !lists[route.section]) await loadList(route.section).catch(() => {});

  if (route.page === "edit" && route.file && !editor) {
    try {
      const section = route.section ? config.sections.find((s) => s.name === route.section) : null;
      editor = await openEditor({ file: route.file, section, config });
      watchForPreview(editor);
      editor.blocks?.onState(() => drawToolbar());
      if (narrow()) showInspector = false;
    } catch (e) { toast(e.message, "error"); editor = null; }
  }

  if (route.page === "images") {
    fill(docpane, libraryBrowser({ folder: config.site.mediaInput }).el);
    fill(inspectorEl);
  } else if (editor) {
    fill(docpane, h("div", { class: "doc-scroll" }, editor.doc));
    fill(inspectorEl, h("div", { class: "sheet-head" }, h("span", {}, t("Details")), h("button", { class: "link-btn", onclick: () => toggleInspector() }, t("Done"))), editor.inspector);
  } else {
    const s = config.sections.find((x) => x.name === route.section);
    fill(docpane, h("div", { class: "doc-empty" },
      h("p", {}, s ? t("Choose one of your {label}, or start a new one.", { label: lang() === "ja" ? t(s.label) : s.label.toLowerCase() }) : t("Choose something from the sidebar.")),
      s && s.kind === "collection" ? h("button", { class: "btn", onclick: () => newEntry(s) }, icon("compose"), t("New")) : null));
    fill(inspectorEl);
  }
  app.classList.toggle("images-open", route.page === "images");
  drawSidebar();
  drawList();
  layout();
  document.title = `${editor ? editor.title + " · " : ""}${config.site.name} · wip cms`;
}
async function reopen() { editor?.destroy(); editor = null; await go(); }

// ---------- choosing a site ----------

async function chooseSite(canCancel) {
  const { site, recent } = await api.site();
  const input = h("input", { class: "field-input", placeholder: "/Users/you/Documents/my-site", value: site?.root || "" });
  const err = h("p", { class: "error-text small" });
  const open = async (path) => {
    err.textContent = "";
    try {
      if (!path) return input.focus();
      const info = await api.inspectSite(path);
      if (!info.exists) { err.textContent = t("There's no folder at {path}.", { path: info.root }); return; }
      // not set up for wip cms yet: offer to set it up
      if (!info.hasConfig) { overlay.remove(); openSetup(info, () => chooseSite(canCancel)); return; }
      await editor?.flush();
      await api.openSite(path);
      location.hash = "";
      location.reload();
    } catch (e) { err.textContent = e.message; }
  };
  const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog wide" },
    h("p", { class: "dialog-title" }, t("Open a site")),
    h("p", { class: "muted small" }, t("The site's main folder. In Finder, select the folder and press ⌥⌘C to copy its path, then paste it here. A folder that isn't set up for wip cms yet (a new client site, say) gets a few questions first.")),
    input, err,
    recent.length ? h("div", { class: "recent" }, h("p", { class: "muted small" }, t("Recent")),
      recent.map((p) => h("button", { class: "recent-site", onclick: () => open(p) }, icon("folder"), h("span", {}, p)))) : null,
    h("div", { class: "dialog-buttons" },
      canCancel ? h("button", { class: "btn", onclick: () => overlay.remove() }, t("Cancel")) : null,
      h("button", { class: "btn primary", onclick: () => open(input.value.trim()) }, t("Open")))));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") open(input.value.trim()); });
  document.body.append(overlay);
  input.focus();
}

// ---------- start ----------

(async () => {
  const { site } = await api.site();
  if (!site) { app.hidden = true; await chooseSite(false); return; }
  // the site's settings can't be read (moved, or .pages.yml deleted): pick a site again
  try { config = await api.config(); } catch (e) { app.hidden = true; await chooseSite(false); toast(t("Couldn't read that site's settings (.pages.yml), so pick a site to open."), "error"); return; }
  setMediaRoot(config.site.mediaInput);
  if (narrow()) showInspector = false;
  await Promise.all(config.sections.filter((s) => s.kind === "collection").map((s) => loadList(s.name).catch(() => {})));
  window.addEventListener("hashchange", go);
  let wasNarrow = narrow();
  window.addEventListener("resize", () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); layout(); } });
  await go();
  refreshChanges();
  setInterval(refreshChanges, 15000);
  waitForPreview();
})();
