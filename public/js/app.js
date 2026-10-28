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

// light / dark / follow the Mac
function setTheme(t) {
  try { localStorage.setItem("wip-theme", t); } catch { /* fine */ }
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
const theme = () => { try { return localStorage.getItem("wip-theme") || "system"; } catch { return "system"; } };

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
      h("button", { class: "site-btn", title: "Open another site", onclick: () => chooseSite(true) }, h("span", {}, config.site.name), icon("chevrons")),
      tbtn("sidebar", "Hide sidebar", () => toggleSidebar(), { cls: "side-hide" })),
    h("nav", { class: "side-scroll" },
      h("div", { class: "side-group" }, "Library"),
      collections.map((s) => item("#/s/" + s.name, s.name === "projects" ? "grid" : "text", s.label, lists[s.name]?.length, route.section === s.name)),
      item("#/images", "images", "Images", null, route.page === "images"),
      Object.entries(groups).map(([g, items]) => [
        h("div", { class: "side-group" }, g[0].toUpperCase() + g.slice(1)),
        items.map((s) => item("#/edit/" + s.path, g === "pages" ? (s.name === "home" ? "house" : "text") : "gear", s.label, null, route.file === s.path)),
      ])),
    h("div", { class: "side-foot" },
      changesCount == null ? null : h("span", { class: "dot" + (changesCount ? " on" : "") }),
      changesCount == null ? "" : changesCount ? `${changesCount} change${changesCount > 1 ? "s" : ""} ready to publish` : "Everything is published"));
}

// ---------- the post list ----------

const asDate = (d) => new Date(String(d).slice(0, 10) + "T12:00:00");
const MONTH = (d) => asDate(d).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const SHORT = (d) => asDate(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

async function loadList(name, force) {
  if (!lists[name] || force) lists[name] = await api.list(name);
  return lists[name];
}

function drawList() {
  const s = config.sections.find((x) => x.name === route.section && x.kind === "collection");
  app.classList.toggle("no-list", !s);
  if (!s) return fill(listEl);
  const all = lists[s.name] || [];
  const shown = all.filter((e) => !filter || (e.title + " " + (e.excerpt || "")).toLowerCase().includes(filter));
  const drafts = all.filter((e) => e.draft).length;
  const rows = [];
  let lastGroup = null;
  for (const e of shown) {
    const group = e.date ? MONTH(e.date) : "No date";
    if (group !== lastGroup) { rows.push(h("div", { class: "list-group" }, group)); lastGroup = group; }
    rows.push(h("a", { class: "row-item" + (route.file === e.file ? " active" : ""), href: "#/edit/" + e.file },
      e.featuredImage ? h("img", { class: "row-thumb", src: e.featuredImage, alt: "", loading: "lazy" }) : h("span", { class: "row-thumb empty" }),
      h("span", { class: "row-text" },
        h("span", { class: "row-title" }, e.isBook ? h("i", {}, e.title) : e.title),
        h("span", { class: "row-sub" }, e.date ? SHORT(e.date) : "", e.draft ? h("span", { class: "badge" }, "Draft") : null),
        e.excerpt ? h("span", { class: "row-excerpt" }, e.excerpt) : null)));
  }
  const search = h("input", { class: "search-input", type: "search", placeholder: "Search", "aria-label": `Search ${s.label}`, value: filter,
    oninput: () => { filter = search.value.toLowerCase(); drawList(); const el = listEl.querySelector(".search-input"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  fill(listEl,
    h("div", { class: "list-head" },
      h("a", { class: "tbtn back-btn", href: "#/", "aria-label": "Sections" }, icon("back")),
      h("div", { class: "list-title" }, h("div", { class: "list-name" }, s.label),
        h("div", { class: "list-count" }, `${all.length} ${all.length === 1 ? "item" : "items"}${drafts ? `, ${drafts} draft${drafts > 1 ? "s" : ""}` : ""}`)),
      tbtn("compose", `New in ${s.label}`, () => newEntry(s))),
    h("label", { class: "search" }, icon("search"), search),
    h("div", { class: "list-scroll" }, rows.length ? rows : h("p", { class: "muted list-empty" }, filter ? "Nothing matches." : "Nothing here yet.")));
}

function newEntry(section) {
  const singular = section.label.replace(/s$/, "").replace(/ posts?$/, " post").toLowerCase();
  const input = h("input", { class: "field-input", placeholder: "Title" });
  const go = async () => {
    const title = input.value.trim();
    if (!title) return input.focus();
    overlay.remove();
    try {
      const created = await api.create(section.name, title);
      await loadList(section.name, true);
      location.hash = "#/edit/" + created.file;
    } catch (e) { toast(e.message, "error"); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") overlay.remove(); });
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h("div", { class: "dialog" }, h("p", { class: "dialog-title" }, `New ${singular}`), input,
      h("p", { class: "muted small" }, "The title also becomes its web address. New posts start as drafts."),
      h("div", { class: "dialog-buttons" }, h("button", { class: "btn", onclick: () => overlay.remove() }, "Cancel"), h("button", { class: "btn primary", onclick: go }, "Create"))));
  document.body.append(overlay);
  input.focus();
}

// ---------- toolbar ----------

let statusEl = null;
function drawToolbar() {
  const left = [];
  if (narrow()) left.push(h("a", { class: "tbtn", href: route.section ? "#/s/" + route.section : "#/", "aria-label": "Back" }, icon("back")));
  else if (!showSidebar) left.push(tbtn("sidebar", "Show sidebar", () => toggleSidebar()));
  statusEl = h("div", { class: "doc-status" }, editor ? editor.status() : "");
  const title = h("div", { class: "toolbar-title" },
    h("div", { class: "toolbar-name" }, route.page === "images" ? "Images" : editor ? editor.title : ""), editor ? statusEl : null);

  const right = [];
  const v = currentView();
  if (editor) {
    const b = editor.blocks;
    if (b && v !== "preview" && !narrow()) {
      right.push(tbtn("insert", "Insert a block", () => b.insert()));
      if (b.hasPhotos()) right.push(tbtn("images", "Add photos", () => b.addPhotos()));
      right.push(tbtn("arrows", b.isRearranging() ? "Done rearranging" : "Rearrange blocks", () => b.toggleRearrange(), { on: b.isRearranging() }));
    }
    if (!narrow()) right.push(h("a", { class: "tbtn", href: `http://localhost:${config.preview.port}${editor.url}`, target: "_blank", rel: "noopener", "aria-label": "Open on your site", title: "Open on your site (new tab)" }, icon("external")));
    right.push(tbtn(narrow() ? "info" : "inspector", showInspector ? "Hide details" : "Show details", () => toggleInspector(), { on: showInspector && !narrow() }));
  }
  const more = tbtn("more", "More", () => popMenu(more, [
    ...(editor ? [
      { label: "Revert to when opened", run: async () => { if (await editor.revert()) reopen(); } },
      ...(editor.section ? [{ label: "Move to Trash", danger: true, run: async () => {
        const section = editor.section.name;
        if (await editor.remove()) { editor.destroy(); editor = null; await loadList(section, true); location.hash = "#/s/" + section; }
      } }] : []),
      "-",
    ] : []),
    { heading: "Appearance" },
    ...[["system", "Match my Mac"], ["light", "Light"], ["dark", "Dark"]].map(([t, label]) => ({ label, checked: theme() === t, run: () => setTheme(t) })),
    "-",
    { label: "Open another site…", run: () => chooseSite(true) },
  ]));
  right.push(more);

  const views = editor ? segmented("View", narrow() ? [["write", "Write"], ["preview", "Preview"]] : [["write", "Write"], ["split", "Split"], ["preview", "Preview"]], v, setView) : null;
  fill(toolbarEl, h("div", { class: "toolbar-side" }, left, title), views, h("div", { class: "toolbar-side end" }, right));

  // phone: the most-used block actions float at the bottom
  const b = editor?.blocks;
  fill(phonebar, narrow() && b && v === "write" ? [
    b.hasPhotos() ? h("button", { "aria-label": "Add photos", onclick: () => b.addPhotos() }, icon("images")) : null,
    h("button", { "aria-label": "Rearrange blocks", class: b.isRearranging() ? "on" : "", onclick: () => b.toggleRearrange() }, icon("arrows")),
    h("button", { "aria-label": "Insert a block", class: "primary", onclick: () => b.insert() }, icon("plus")),
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

const previewFrame = h("iframe", { class: "preview-frame", title: "Live preview" });
const previewNote = h("span", { class: "preview-note" });
function drawPreviewBar() {
  fill(previewpane,
    h("div", { class: "preview-bar" },
      h("span", { class: "live-dot", "aria-hidden": "true" }), previewNote,
      h("div", { class: "segmented icons", role: "group", "aria-label": "Preview size" },
        [["full", "laptop", "Computer"], ["phone", "phone", "Phone"]].map(([v, ic, label]) =>
          h("button", { class: v === previewSize ? "on" : "", "aria-label": label, title: label, onclick: () => { previewSize = v; pref.set("preview-size", v); drawPreviewBar(); } }, icon(ic)))),
      tbtn("refresh", "Reload preview", () => { if (previewFrame.dataset.url) previewFrame.src = previewFrame.dataset.url; })),
    h("div", { class: "preview-stage" + (previewSize === "phone" ? " phone" : "") }, previewFrame));
}
drawPreviewBar();

const LIVE = "Live: shows changes as you type";
let draftTimer = null;
function wirePreview() {
  if (!editor) return;
  const url = `http://localhost:${config.preview.port}${editor.url}`;
  if (previewFrame.dataset.url !== url) { previewFrame.dataset.url = url; previewFrame.src = url; }
  previewNote.textContent = config.preview.status === "unavailable" ? config.preview.message
    : config.preview.status === "starting" ? "Starting the preview…" : LIVE;
}
function watchForPreview(ed) {
  // the preview might still show edits from last time that were never saved: go back to the file
  api.discardDraft(ed.file).catch(() => {});
  ed.onChange(() => {
    clearTimeout(draftTimer);
    if (currentView() === "write") return; // saving a moment later updates the preview anyway
    previewNote.textContent = "Updating…";
    draftTimer = setTimeout(async () => {
      try { await api.draft(ed.file, ed.data, ed.body); previewNote.textContent = LIVE; }
      catch (e) { previewNote.textContent = e.message; }
    }, 400);
  });
  ed.onStatus((t) => { if (statusEl) statusEl.textContent = t; if (t === "Saved") afterSave(); });
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
    fill(inspectorEl, h("div", { class: "sheet-head" }, h("span", {}, "Details"), h("button", { class: "link-btn", onclick: () => toggleInspector() }, "Done")), editor.inspector);
  } else {
    const s = config.sections.find((x) => x.name === route.section);
    fill(docpane, h("div", { class: "doc-empty" },
      h("p", {}, s ? `Choose one of your ${s.label.toLowerCase()}, or start a new one.` : "Choose something from the sidebar."),
      s && s.kind === "collection" ? h("button", { class: "btn", onclick: () => newEntry(s) }, icon("compose"), "New") : null));
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
    try { await editor?.flush(); await api.openSite(path); location.hash = ""; location.reload(); }
    catch (e) { err.textContent = e.message; }
  };
  const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog wide" },
    h("p", { class: "dialog-title" }, "Open a site"),
    h("p", { class: "muted small" }, "The site's main folder: the one with .pages.yml in it. In Finder, select the folder and press ⌥⌘C to copy its path, then paste it here."),
    input, err,
    recent.length ? h("div", { class: "recent" }, h("p", { class: "muted small" }, "Recent"),
      recent.map((p) => h("button", { class: "recent-site", onclick: () => open(p) }, icon("folder"), h("span", {}, p)))) : null,
    h("div", { class: "dialog-buttons" },
      canCancel ? h("button", { class: "btn", onclick: () => overlay.remove() }, "Cancel") : null,
      h("button", { class: "btn primary", onclick: () => open(input.value.trim()) }, "Open"))));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") open(input.value.trim()); });
  document.body.append(overlay);
  input.focus();
}

// ---------- start ----------

(async () => {
  const { site } = await api.site();
  if (!site) { app.hidden = true; await chooseSite(false); return; }
  config = await api.config();
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
