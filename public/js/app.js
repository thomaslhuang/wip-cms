// The app: top bar, the panels, and opening things.
//
// Panels (see dock.js for moving them around):
//   Navigator  your sections (blog posts, projects, pages) and what's in them
//   Details    title, featured image, date, tags... of the open post
//   Content    its blocks
//   Preview    the real page, updating as you type (lib/preview.js)
//   Images     the image library
//
// The address (#/edit/src/blog/.../index.md) says what's open, so reloading keeps your place.
import { h, fill, icon, toast } from "./util.js";
import { api } from "./api.js";
import { openEditor } from "./editor.js";
import { createDock } from "./dock.js";
import { libraryBrowser, setMediaRoot } from "./media.js";

let config;
let editor = null; // the open post/page (from editor.js), if any

// ---------- the panels ----------

const panelEls = {
  navigator: h("div", { class: "panel navigator" }),
  details: h("div", { class: "panel" }),
  content: h("div", { class: "panel" }),
  preview: h("div", { class: "panel preview" }),
  images: h("div", { class: "panel" }),
};
const PANELS = {
  navigator: { title: "Navigator", el: panelEls.navigator },
  details: { title: "Details", el: panelEls.details },
  content: { title: "Content", el: panelEls.content },
  preview: { title: "Preview", el: panelEls.preview },
  images: { title: "Images", el: panelEls.images },
};
const stack = (...panels) => ({ type: "stack", panels, active: 0 });
const PRESETS = {
  "Write with preview": { type: "split", dir: "row", sizes: [0.17, 0.22, 0.33, 0.28], children: [stack("navigator", "images"), stack("details"), stack("content"), stack("preview")] },
  "Write": { type: "split", dir: "row", sizes: [0.18, 0.27, 0.55], children: [stack("navigator", "images"), stack("details"), stack("content")] },
  "Focus": { type: "split", dir: "row", sizes: [0.55, 0.45], children: [stack("content", "details"), stack("preview")] },
  "Preview below": { type: "split", dir: "row", sizes: [0.2, 0.8], children: [stack("navigator", "images"),
    { type: "split", dir: "col", sizes: [0.55, 0.45], children: [{ type: "split", dir: "row", sizes: [0.35, 0.65], children: [stack("details"), stack("content")] }, stack("preview")] }] },
};
let dock;

// ---------- top bar ----------

const siteBtn = document.getElementById("site-name");
const crumbs = document.getElementById("crumbs");
const actionsEl = document.getElementById("actions");
const windowBtn = document.getElementById("window-btn");
const windowMenu = document.getElementById("window-menu");

function drawWindowMenu() {
  fill(windowMenu,
    h("div", { class: "menu-heading" }, "panels"),
    Object.entries(PANELS).map(([id, p]) => h("button", { onclick: () => { dock.isShown(id) ? dock.hide(id) : dock.show(id); drawWindowMenu(); } },
      h("span", { class: "check" }, dock.isShown(id) ? "✓" : ""), p.title)),
    h("div", { class: "menu-heading" }, "layouts"),
    dock.presets.map((name) => h("button", { onclick: () => { dock.usePreset(name); windowMenu.hidden = true; } }, h("span", { class: "check" }), name)));
}
windowBtn.addEventListener("click", (e) => { e.stopPropagation(); drawWindowMenu(); windowMenu.hidden = !windowMenu.hidden; });
document.addEventListener("click", (e) => { if (!windowMenu.contains(e.target)) windowMenu.hidden = true; });

// ---------- Navigator ----------

const openSections = new Set(JSON.parse(localStorage.getItem("wip-open-sections") || '["blog"]'));
let filter = "";

async function drawNavigator() {
  const box = panelEls.navigator;
  const search = h("input", { class: "input nav-search", placeholder: "find…", value: filter,
    oninput: () => { filter = search.value.toLowerCase(); drawNavigator().then(() => { const s = box.querySelector(".nav-search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); } });
  const parts = [search];
  const groups = {};
  for (const s of config.sections) {
    if (s.kind === "collection") {
      const isOpen = openSections.has(s.name) || filter;
      const head = h("div", { class: "nav-section" },
        h("button", { class: "nav-toggle", onclick: () => { openSections.has(s.name) ? openSections.delete(s.name) : openSections.add(s.name); localStorage.setItem("wip-open-sections", JSON.stringify([...openSections])); drawNavigator(); } },
          icon("chevron", "chev" + (isOpen ? " down" : "")), s.label),
        h("button", { class: "icon-btn", title: `New in ${s.label}`, onclick: () => newEntry(s) }, icon("plus")));
      parts.push(head);
      if (isOpen) {
        const list = (await api.list(s.name)).filter((e) => !filter || e.title.toLowerCase().includes(filter));
        parts.push(h("div", { class: "nav-items" }, list.map((e) => h("a", { class: "nav-item" + (editor?.file === e.file ? " active" : ""), href: "#/edit/" + e.file, title: e.file },
          e.featuredImage ? h("img", { class: "nav-thumb", src: e.featuredImage, alt: "", loading: "lazy" }) : h("span", { class: "nav-thumb empty" }),
          h("span", { class: "nav-item-text" }, h("span", { class: "nav-item-title" }, e.isBook ? h("i", {}, e.title) : e.title),
            h("span", { class: "muted nav-item-meta" }, (e.date || "").slice(0, 10), e.draft ? " · draft" : ""))))));
      }
    } else (groups[s.group || "settings"] ||= []).push(s);
  }
  for (const [group, items] of Object.entries(groups)) {
    parts.push(h("div", { class: "nav-heading" }, group));
    parts.push(...items.filter((s) => !filter || s.label.toLowerCase().includes(filter)).map((s) =>
      h("a", { class: "nav-item page" + (editor?.file === s.path ? " active" : ""), href: "#/edit/" + s.path }, icon("menu"), h("span", {}, s.label))));
  }
  parts.push(h("p", { class: "muted small nav-foot" }, "Saving writes straight into ", h("b", {}, config.site.name), ". Publish however you normally do (e.g. GitHub Desktop)."));
  fill(box, parts);
}

function newEntry(section) {
  const singular = section.label.replace(/s$/, "").replace(/ posts?$/, " post");
  const input = h("input", { class: "input", placeholder: `title of the new ${singular}` });
  const go = async () => {
    const title = input.value.trim();
    if (!title) return input.focus();
    overlay.remove();
    try {
      const created = await api.create(section.name, title);
      toast(`Created ${created.file}`);
      openSections.add(section.name);
      location.hash = "#/edit/" + created.file;
    } catch (e) { toast(e.message, "error"); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") overlay.remove(); });
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h("div", { class: "dialog" }, h("p", {}, `New ${singular}`), input,
      h("p", { class: "muted small" }, "The title also becomes its web address. New posts start as drafts."),
      h("div", { class: "dialog-buttons" }, h("button", { class: "btn", onclick: () => overlay.remove() }, "Cancel"), h("button", { class: "btn primary", onclick: go }, "Create"))));
  document.body.append(overlay);
  input.focus();
}

// ---------- Preview ----------

const previewFrame = h("iframe", { class: "preview-frame", title: "Live preview" });
const previewNote = h("span", { class: "muted small preview-note" });
let previewWidth = localStorage.getItem("wip-preview-width") || "full";
const widthBtns = ["full", "tablet", "phone"].map((w) => h("button", { class: "seg-btn", "data-w": w, onclick: () => { previewWidth = w; localStorage.setItem("wip-preview-width", w); setPreviewWidth(); } }, w));
function setPreviewWidth() {
  widthBtns.forEach((b) => b.classList.toggle("on", b.dataset.w === previewWidth));
  previewFrame.style.width = { full: "100%", tablet: "900px", phone: "390px" }[previewWidth];
}
fill(panelEls.preview,
  h("div", { class: "preview-bar" }, h("div", { class: "seg" }, widthBtns), previewNote,
    h("button", { class: "icon-btn", title: "Reload", onclick: () => { previewFrame.src = previewFrame.src; } }, icon("refresh"))),
  h("div", { class: "preview-stage" }, previewFrame));
setPreviewWidth();

let draftTimer = null;
function wirePreview() {
  if (!editor) { previewFrame.removeAttribute("src"); previewNote.textContent = "Open a post or page to preview it."; return; }
  const url = `http://localhost:${config.preview.port}${editor.url}`;
  // the preview might still show unsaved edits from last time: go back to what's saved
  api.discardDraft(editor.file).catch(() => {});
  if (previewFrame.dataset.url !== url) { previewFrame.dataset.url = url; previewFrame.src = url; }
  previewNote.textContent = config.preview.status === "unavailable" ? config.preview.message : "";
  // unsaved edits go to the preview only (not your files) a moment after you stop typing
  editor.onChange(() => {
    clearTimeout(draftTimer);
    previewNote.textContent = "updating…";
    draftTimer = setTimeout(async () => {
      try { await api.draft(editor.file, editor.data, editor.body); previewNote.textContent = ""; }
      catch (e) { previewNote.textContent = e.message; }
    }, 450);
  });
}
// wait for the preview server on first start
async function waitForPreview() {
  for (let i = 0; i < 40 && config.preview.status === "starting"; i++) {
    previewNote.textContent = "starting the preview…";
    await new Promise((r) => setTimeout(r, 750));
    config.preview = await api.preview();
  }
  if (config.preview.status !== "starting" && editor) { previewFrame.src = previewFrame.dataset.url; previewNote.textContent = config.preview.message || ""; }
}

// ---------- opening things ----------

const placeholder = (text) => h("div", { class: "panel-pad muted" }, text);

let lastHash = location.hash, ignoreNext = false;
async function route() {
  if (ignoreNext) { ignoreNext = false; return; }
  if (editor?.isDirty() && !confirm("You have unsaved changes. Leave without saving?")) {
    ignoreNext = true;
    location.hash = lastHash;
    return;
  }
  lastHash = location.hash;
  editor?.destroy();
  editor = null;
  const [, page, ...rest] = (location.hash || "").slice(1).split("/");
  const file = decodeURIComponent(rest.join("/"));
  if (page === "edit" && file) {
    try {
      const section = config.sections.find((s) => s.kind === "collection" && file.startsWith(s.path + "/"));
      editor = await openEditor({ file, section, config, onDelete: () => { editor = null; location.hash = ""; drawNavigator(); } });
      const pageSection = config.sections.find((s) => s.path === file);
      fill(crumbs,
        h("span", { class: "muted" }, section ? section.label : (pageSection?.group || "pages")), h("span", { class: "sep" }, "›"),
        h("span", {}, section ? file.slice(section.path.length + 1).replace(/\/index\.md$/, "") : (pageSection?.label || file)));
      fill(panelEls.details, editor.details);
      fill(panelEls.content, editor.content);
      fill(actionsEl, editor.actions);
    } catch (e) {
      toast(e.message, "error");
      editor = null;
    }
  }
  if (!editor) {
    fill(crumbs, h("span", { class: "muted" }, "nothing open"));
    fill(panelEls.details, placeholder("Open a post, project or page from the Navigator."));
    fill(panelEls.content, placeholder("Open a post, project or page from the Navigator."));
    fill(actionsEl);
  }
  wirePreview();
  drawNavigator();
}

// ---------- choosing a site ----------

async function chooseSite(canCancel) {
  const { site, recent } = await api.site();
  return new Promise((resolve) => {
    const input = h("input", { class: "input", placeholder: "/Users/you/Documents/my-site", value: site?.root || "" });
    const open = async (path) => {
      try { await api.openSite(path); location.hash = ""; location.reload(); }
      catch (e) { err.textContent = e.message; }
    };
    const err = h("p", { class: "error-text small" });
    const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog wide" },
      h("p", { class: "dialog-title" }, "Open a site"),
      h("p", { class: "muted small" }, "The site's main folder: the one with .pages.yml in it. On a Mac, drag the folder from Finder into this box to fill in its path."),
      input, err,
      recent.length ? h("div", { class: "recent" }, h("p", { class: "muted small" }, "recent"),
        recent.map((p) => h("button", { class: "recent-site", onclick: () => open(p) }, icon("folder"), h("span", {}, p)))) : null,
      h("div", { class: "dialog-buttons" },
        canCancel ? h("button", { class: "btn", onclick: () => { overlay.remove(); resolve(null); } }, "Cancel") : null,
        h("button", { class: "btn primary", onclick: () => open(input.value.trim()) }, "Open"))));
    // dropping a folder from Finder gives its path in some browsers; typing works everywhere
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") open(input.value.trim()); });
    document.body.append(overlay);
    input.focus();
  });
}
siteBtn.addEventListener("click", () => chooseSite(true));

// ---------- start ----------

(async () => {
  const { site } = await api.site();
  if (!site) { await chooseSite(false); return; }
  config = await api.config();
  siteBtn.textContent = config.site.name;
  document.title = `${config.site.name} · WIP CMS`;
  setMediaRoot(config.site.mediaInput);
  fill(panelEls.images, libraryBrowser({ folder: config.site.mediaInput }).el);
  dock = createDock(document.getElementById("dock"), PANELS, PRESETS);
  window.addEventListener("hashchange", route);
  await route();
  waitForPreview();
})();
