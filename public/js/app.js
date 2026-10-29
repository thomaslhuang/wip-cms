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
import { ghost, autoScroll } from "./drag.js";
import { openSetup } from "./setup.js";
import { openSettings } from "./settings.js";
import { openAddSection } from "./addsection.js";
import { installQuotes } from "./quotes.js";
import { onLaunch } from "./settings.js";
import { t, t2, tl, fmtDate, dayParts, lang } from "./i18n.js";
import { applyTheme, setMode as setTheme, mode as theme, openAppearance } from "./theme.js";

applyTheme();
installQuotes();

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
  // the menu is drawn at the Interface Size, so its position is too
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
  const menu = h("div", { class: "popmenu", role: "menu", style: { top: (r.bottom + 6) / scale + "px", right: Math.max(8, window.innerWidth - r.right) / scale + "px" } },
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

// The sidebar, top to bottom:
//   Collections   things you keep adding to: blog posts, projects (.pages.yml type: collection,
//                 or a data file with list: true)
//   <groups>      single pages, under the group they're in in .pages.yml (e.g. "pages")
//   Site          everything else that's one of a kind (site-wide details like the site's
//                 title), and the Images library
function drawSidebar() {
  const collections = config.sections.filter((s) => s.kind === "collection");
  const groups = {};
  config.sections.filter((s) => s.kind !== "collection").forEach((s) => (groups[s.group || ""] ||= []).push(s));
  const siteItems = groups[""] || [];
  delete groups[""];
  const item = (href, iconName, label, count, active) => h("a", { class: "side-item" + (active ? " active" : ""), href },
    icon(iconName, "side-icon"), h("span", { class: "side-label" }, label), count != null ? h("span", { class: "side-count" }, count) : null);
  const pageItem = (s, iconName) => item("#/edit/" + s.path, iconName, tl(s.label), null, route.file === s.path);
  fill(sidebarEl,
    h("div", { class: "side-head" },
      h("button", { class: "site-btn", title: t("Open another site"), onclick: () => chooseSite(true) }, h("span", {}, config.site.name), icon("chevrons")),
      tbtn("sidebar", t("Hide sidebar"), () => toggleSidebar(), { cls: "side-hide" })),
    h("nav", { class: "side-scroll" },
      collections.length ? h("div", { class: "side-group" }, t("Collections")) : null,
      collections.map((s) => item("#/s/" + s.name, s.name === "projects" ? "grid" : s.store === "list" ? "list" : "text", tl(s.label), lists[s.name]?.length, route.section === s.name)),
      Object.entries(groups).map(([g, items]) => [
        h("div", { class: "side-group" }, tl(g)),
        items.map((s) => pageItem(s, s.name === "home" || s.name === "index" ? "house" : "text")),
      ]),
      h("div", { class: "side-group" }, t("Site")),
      item("#/images", "images", t("Media"), null, route.page === "images"),
      siteItems.map((s) => pageItem(s, "gear"))),
    h("div", { class: "side-foot" },
      changesCount == null ? null : h("span", { class: "dot" + (changesCount ? " on" : "") }),
      h("span", { class: "side-foot-text" }, changesCount == null ? "" : changesCount ? t2(changesCount, "{n} change to publish", "{n} changes to publish") : t("Everything is published")),
      tbtn("plus", t("Add a collection or page"), () => openAddSection(sectionAdded), { cls: "side-add" })));
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

  const view = listView(s);
  // the date beside each post in the list view: the day when grouped by month; for posts dated
  // by the day (blog posts), the date otherwise too; none for things dated by the year (projects)
  const dateLabel = view.group === "month" ? (e) => (e.date ? fmtDate(e.date, "weekday") : "")
    : naturalGroup(s) === "month" ? (e) => (e.date ? fmtDate(e.date, view.group === "year" ? "day" : "short") : "") : () => "";
  const items = { rows: (e) => rowItem(e, dateLabel(e)), grid: tileItem,
    text: (e) => textItem(e, ["month", "year"].includes(view.group) && naturalGroup(s) === "month" ? e.date : null, view.group) }[mode];
  const groups = groupEntries(s, shown, view);

  // each group (and month) can be folded away; while searching everything is open, so
  // nothing that matches is hidden
  const open = (key) => filter || !isFolded(s.name, key);
  const head = (key, label, count, level) => h("button", { class: `tree-head ${level}`, "aria-expanded": String(open(key)), onclick: () => toggleFold(s.name, key) },
    icon("chevron", "tree-chev"), h("span", { class: "tree-label" }, label), h("span", { class: "tree-count" }, count));
  // a list kept in one data file, shown in its own order: drag items to reorder the site
  const canReorder = s.store === "list" && view.sort === "order" && view.group === "none" && !filter && all.length > 1;
  const box = (entries) => {
    const el = h("div", { class: "list-items " + mode + (canReorder ? " reorderable" : "") }, entries.map(items));
    if (canReorder) reorderable(el, s);
    return el;
  };
  const rows = view.group === "none" ? [box(groups[0]?.entries || [])] : groups.map((g) => h("div", { class: "tree-year" },
    head(g.key, g.label, g.count, "year"),
    !open(g.key) ? null
      : !g.children || mode === "grid" ? box(g.entries)
      : h("div", { class: "tree-body" }, g.children.map((m) => h("div", { class: "tree-month" },
          head(m.key, m.label, m.entries.length, "month"),
          open(m.key) ? box(m.entries) : null)))));

  const search = h("input", { class: "search-input", type: "search", placeholder: t("Search"), "aria-label": t("Search {label}", { label: t(s.label) }), value: filter,
    oninput: () => { filter = search.value.toLowerCase(); drawList(); const el = listEl.querySelector(".search-input"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  fill(listEl,
    h("div", { class: "list-head" },
      h("a", { class: "tbtn back-btn", href: "#/", "aria-label": t("Sections") }, icon("back")),
      h("div", { class: "list-title" }, h("div", { class: "list-name" }, tl(s.label)),
        h("div", { class: "list-count" }, t2(all.length, "{n} item", "{n} items") + (drafts ? t2(drafts, ", {n} draft", ", {n} drafts") : ""))),
      tbtn("compose", t("New in {label}", { label: tl(s.label) }), () => newEntry(s))),
    h("div", { class: "list-tools" },
      h("label", { class: "search" }, icon("search"), search),
      segmentedIcons(t("Show as"), [["rows", "rows", t("List")], ["grid", "grid", t("Grid")], ["text", "text", t("Titles only")]], mode, (m) => setListMode(s.name, m)),
      viewButton(s, view)),
    h("div", { class: "list-scroll" }, rows.length ? rows : h("p", { class: "muted list-empty" }, filter ? t("Nothing matches.") : t("Nothing here yet."))),
    h("div", { class: "list-resize", role: "separator", "aria-label": t("Resize list"), onpointerdown: resizeList }));
  if (mode === "rows") alignThumbs();
}

// three ways to show a section, remembered for each one: list (picture, title, first
// words), grid (pictures only, three across), titles only
const listModes = pref.get("list-modes", {});
const listMode = (name) => listModes[name] || "rows";
function setListMode(name, mode) { listModes[name] = mode; pref.set("list-modes", listModes); drawList(); }
// How a section's list is grouped and sorted, remembered for each section (only in w·i·p cms:
// the site's own pages keep their order).
//   group: "month" (years, then months), "year", "field:<name>" (by a choice field, such as
//          a project's category), or "none"
//   sort:  "newest", "oldest" or "title"
// Sections whose files are filed by month (a {month} in the filename template, like blog
// posts) start grouped by month; other dated sections by year; the rest not at all.
// Sections kept as one list in a data file (dosa's projects.json) also have "order": the
// order on the site, which you can change by dragging. They start in that order.
// A section's view.default in .pages.yml (sort: date or title, order: asc or desc) sets
// where it starts too.
const listViews = pref.get("list-views", {});
const hasDates = (s) => s.fields.some((f) => f.type === "date");
const hasYears = (s) => hasDates(s) || s.fields.some((f) => f.name === "year" && ["number", "string", undefined].includes(f.type));
// remembered for each way of showing the list (list, grid, titles only): grouping by month
// suits titles only, while list and grid read best as one run of pictures
const viewsFor = (s) => {
  const v = listViews[s.name] || {};
  return "group" in v || "sort" in v ? { text: v } : v;   // (from before views were separate: it was titles only's)
};
// the grouping a section starts with in titles only: month for posts filed by month, year for other dated sections
const naturalGroup = (s) => (s.store !== "list" && hasDates(s) ? (/\{month\}/.test(s.filename || "") ? "month" : "year") : "none");
function listView(s, mode = listMode(s.name)) {
  const dated = hasYears(s);
  const d = s.view?.default || {};
  const configured = d.sort ? (s.fields.find((f) => f.name === d.sort)?.type === "date" || d.sort === "year" ? (d.order === "asc" ? "oldest" : "newest") : "title") : null;
  const fallback = s.store === "list" ? { group: "none", sort: configured || "order" }
    : { group: mode === "text" ? naturalGroup(s) : "none", sort: configured || (dated ? "newest" : "title") };
  const v = { ...fallback, ...viewsFor(s)[mode] };
  if (v.group.startsWith("field:") && !choiceFields(s).some((f) => "field:" + f.name === v.group)) v.group = fallback.group;
  if (!hasDates(s) && v.group === "month") v.group = dated ? "year" : "none";
  if (!dated && v.group === "year") v.group = "none";
  if (v.sort === "order" && s.store !== "list") v.sort = fallback.sort;
  return v;
}
function setListView(s, change) {
  const mode = listMode(s.name);
  listViews[s.name] = { ...viewsFor(s), [mode]: { ...listView(s, mode), ...change } };
  pref.set("list-views", listViews);
  drawList();
}
const choiceFields = (s) => s.fields.filter((f) => f.type === "select" && !f.options?.multiple);

function sortEntries(entries, sort) {
  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
  const list = [...entries];
  if (sort === "order") return list.sort((a, b) => a.order - b.order);
  if (sort === "title") return list.sort(byTitle);
  // undated entries go last either way
  return list.sort((a, b) => (!a.date) - (!b.date) || (sort === "oldest" ? byDate(a, b) : byDate(b, a)) || byTitle(a, b));
}

// [{ key, label, count, entries, children? }]
function groupEntries(s, entries, view) {
  const sorted = sortEntries(entries, view.sort);
  const groups = [];
  const into = (key, label) => {
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, label, entries: [], count: 0 });
    return g;
  };
  if (view.group === "none") return [{ key: "all", entries: sorted }];
  if (view.group.startsWith("field:")) {
    const f = s.fields.find((x) => "field:" + x.name === view.group);
    const labelOf = (v) => { const o = (f.options?.values || []).find((x) => String(typeof x === "object" ? x.value : x) === v); return tl(String(typeof o === "object" ? o.label ?? o.value : v)); };
    for (const e of sorted) { const v = e.choices?.[f.name]; const g = into(view.group + ":" + (v ?? ""), v ? labelOf(v) : t("None")); g.entries.push(e); g.count++; }
    return groups.sort((a, b) => (a.label === t("None")) - (b.label === t("None")) || a.label.localeCompare(b.label));
  }
  // by date: years (newest first unless sorted oldest first), and months inside for "month"
  for (const e of sorted) {
    let d = e.date ? asDate(/^\d{4}$/.test(e.date) ? e.date + "-07-01" : e.date) : null;   // "2023": a year only
    if (d && isNaN(d)) d = null;
    const g = into(d ? String(d.getFullYear()) : "none", d ? fmtDate(d, "year") : t("No date"));
    g.entries.push(e); g.count++;
    if (view.group === "month" && d) {
      g.children ||= [];
      const mKey = `${g.key}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let m = g.children.find((x) => x.key === mKey);
      if (!m) g.children.push(m = { key: mKey, label: fmtDate(d, "monthName"), entries: [] });
      m.entries.push(e);
    }
  }
  const dir = view.sort === "oldest" ? 1 : -1;
  if (view.sort !== "order") groups.sort((a, b) => (a.key === "none") - (b.key === "none") || dir * a.key.localeCompare(b.key));
  for (const g of groups) g.children?.sort((a, b) => dir * a.key.localeCompare(b.key));
  return groups;
}

// the button beside the view switch: Group By / Sort By
function viewButton(s, view) {
  const dated = hasYears(s);
  const btn = tbtn("sort", t("Group and sort"), () => popMenu(btn, [
    { heading: tl("Group by") },
    ...(hasDates(s) ? [["month", tl("Month")]] : []).concat(dated ? [["year", tl("Year")]] : [], choiceFields(s).map((f) => ["field:" + f.name, tl(f.label || f.name)]), [["none", tl("Nothing")]])
      .map(([g, label]) => ({ label, checked: view.group === g, run: () => setListView(s, { group: g }) })),
    "-",
    { heading: tl("Sort by") },
    ...(s.store === "list" ? [["order", tl("Order on the site")]] : []).concat(dated ? [["newest", tl("Newest first")], ["oldest", tl("Oldest first")]] : [], [["title", tl("Title")]])
      .map(([o, label]) => ({ label, checked: view.sort === o, run: () => setListView(s, { sort: o }) })),
  ]), { cls: "view-btn" });
  return btn;
}

const segmentedIcons = (label, options, current, onpick) => h("div", { class: "segmented icons", role: "group", "aria-label": label },
  options.map(([value, ic, text]) => h("button", { class: value === current ? "on" : "", "aria-pressed": String(value === current), "aria-label": text, title: text, onclick: () => onpick(value) }, icon(ic))));

const isActive = (e) => (route.file === e.file ? " active" : "");
// a list item's id has a # in it (projects.json#3), which can't go in the address as it is
const editHref = (file) => "#/edit/" + String(file).replace(/#/g, "%23");
const titleOf = (e) => (e.isBook ? h("i", {}, e.title) : e.title);
const draftBadge = (e) => (e.draft ? h("span", { class: "badge" }, t("Draft")) : null);
function rowItem(e, date) {
  return h("a", { class: "row-item" + isActive(e), href: editHref(e.file) },
    e.featuredImage ? h("img", { class: "row-thumb", src: e.featuredImage, alt: "", loading: "lazy" }) : h("span", { class: "row-thumb empty" }),
    h("span", { class: "row-text" },
      h("span", { class: "row-title" }, titleOf(e)),
      date || e.draft ? h("span", { class: "row-sub" }, date, draftBadge(e)) : null,
      e.excerpt ? h("span", { class: "row-excerpt" }, e.excerpt) : null));
}
// the grid: square pictures edge to edge; the title shows when you point at one
function tileItem(e) {
  return h("a", { class: "tile" + isActive(e) + (e.featuredImage ? "" : " no-pic"), href: editHref(e.file), title: e.title, "aria-label": e.title },
    e.featuredImage ? h("img", { src: e.featuredImage, alt: "", loading: "lazy" }) : null,
    h("span", { class: "tile-title" }, titleOf(e)),
    draftBadge(e));
}
// Titles only: the date in fixed-width columns before the title, so the titles line up and
// sit the same distance from it.
//   grouped by month   western "Thu 22" (day of the week left, number right)
//                      japanese "22日 (木)" (number right, so 日 and the day of the week line up)
//   grouped by year    western "Oct 22" · japanese "10月22日" (numbers right, so 月 and 日 line up)
// A title too long for the list scrolls sideways while you point at it (the date stays put).
function textItem(e, date, group) {
  const p = date ? dayParts(date) : null;
  const span = (cls, text) => h("span", { class: cls }, text);
  const day = !p ? null
    : group === "year" ? (p.style === "western"
      ? h("span", { class: "text-date western" }, span("td-wd", p.monthName), span("td-day", p.day))
      : h("span", { class: "text-date japanese by-year" }, span("td-day", p.month), span("td-ni", "月"), span("td-day", p.day), span("td-ni", "日")))
    : p.style === "western"
      ? h("span", { class: "text-date western" }, span("td-wd", p.weekday), span("td-day", p.day))
      : h("span", { class: "text-date japanese" }, span("td-day", p.day), span("td-ni", "日"), span("td-wd", `(${p.weekday})`));
  const title = h("span", { class: "text-title" }, h("span", { class: "text-title-inner" }, titleOf(e)));
  // a draft: a small dot in the margin left of the date (so the dates stay lined up)
  const dot = e.draft ? h("span", { class: "draft-dot", title: t("Draft"), "aria-label": t("Draft") }) : null;
  return h("a", { class: "text-item" + isActive(e), href: editHref(e.file), onmouseenter: () => marquee(title), onmouseleave: () => title.classList.remove("marquee") },
    dot, day, title, day ? null : draftBadge(e));
}
// scroll a title that doesn't fit, back and forth, at an even reading speed
function marquee(box) {
  if (box.scrollWidth - box.clientWidth <= 2) return;
  box.classList.add("marquee");   // the text becomes one block, so its whole width can be measured
  const over = box.firstChild.offsetWidth - box.clientWidth;   // (unscaled, so it's right at any Interface size)
  box.style.setProperty("--shift", -Math.ceil(over) - 2 + "px");
  box.style.setProperty("--marquee-time", Math.max(3, over / 35 + 2.4).toFixed(1) + "s");
}

// Dragging an item to a new place in a list section. The item itself moves as you drag (a
// copy follows the pointer); letting go saves the new order into the data file.
function reorderable(container, s) {
  container.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("a");
    if (!el || e.button > 0 || !container.contains(el)) return;
    const from = [...container.children].indexOf(el);
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false, copy = null, scroller = null, last = e;
    // pointing at another item moves this one to its place (after it if it's later, before it
    // if earlier); the item just passed is ignored until the pointer leaves it, so nothing flips back
    let passed = null;
    const inside = (c, ev) => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; };
    const place = (ev) => {
      if (passed && !inside(passed, ev)) passed = null;
      const kids = [...container.children];
      const over = kids.find((c) => c !== el && inside(c, ev));
      if (!over || over === passed) return;
      if (kids.indexOf(over) > kids.indexOf(el)) container.insertBefore(el, over.nextSibling);
      else container.insertBefore(el, over);
      passed = over;
    };
    const move = (ev) => {
      last = ev;
      if (!dragging) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        dragging = true;
        const r = el.getBoundingClientRect();
        copy = ghost(el.cloneNode(true), Math.min(r.width, 260), ev, { x: Math.min(r.width, 260) / 2, y: r.height / 2 });
        el.classList.add("placeholder");
        container.classList.add("reordering");
        scroller = autoScroll([container.closest(".list-scroll")], () => place(last));
      }
      ev.preventDefault();
      copy.move(ev); scroller.at(ev); place(ev);
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragging) return;
      copy.remove(); scroller.stop();
      el.classList.remove("placeholder");
      container.classList.remove("reordering");
      // the click that ends a drag isn't a click on the item
      const eat = (c) => { c.preventDefault(); c.stopPropagation(); };
      window.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 100);
      const to = [...container.children].indexOf(el);
      if (to === from) return;
      try {
        await editor?.flush();
        await api.move(s.name, from, to);
        // the open item (if it's in this list) has a new place: follow it
        const open = route.file && /#(\d+)$/.exec(route.file);
        if (open && route.file.startsWith(s.path + "#")) {
          const i = Number(open[1]);
          const j = i === from ? to : from < i && i <= to ? i - 1 : to <= i && i < from ? i + 1 : i;
          if (j !== i) { history.replaceState(null, "", editHref(`${s.path}#${j}`)); await loadList(s.name, true); return reopen(); }
        }
        await loadList(s.name, true);
        drawList();
        refreshChanges();
      } catch (err) { toast(err.message, "error"); await loadList(s.name, true); drawList(); }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
  // links and pictures in the list mustn't start the browser's own dragging
  container.addEventListener("dragstart", (e) => e.preventDefault());
}

// The list view's pictures start level with the top of the title's lowercase letters (most
// titles start lowercase, and that's where the eye reads the text as starting). Worked out from
// the interface font, so it stays right with any font in Customize.
function alignThumbs() {
  const el = listEl.querySelector(".row-title");
  if (!el) return;
  const cs = getComputedStyle(el);
  const ctx = (alignThumbs.ctx ||= document.createElement("canvas").getContext("2d"));
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = ctx.measureText("x");
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
  const top = (lineHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
  if (isFinite(top)) listEl.style.setProperty("--thumb-nudge", Math.max(0, Math.round(top * 2) / 2) + "px");
}
document.fonts?.ready.then(() => alignThumbs());

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
  // a list in a data file: the address of an existing item, without its last part
  // (/projects/blurring-boundaries/ -> /projects/); no permalink box if items have no slug
  const isList = section.store === "list";
  const hasLink = !isList || section.fields.some((f) => f.name === "slug");
  const sample = isList && (lists[section.name] || []).find((e) => e.url);
  const base = isList ? (sample ? sample.url.replace(/[^/]+\/?$/, "") : "/") : "/" + (section.path.startsWith(root) ? section.path.slice(root.length) : section.path) + "/" +
    (section.filename || "{primary}/index.md").replace("{year}", now.getFullYear()).replace("{month}", String(now.getMonth() + 1).padStart(2, "0")).replace("{day}", String(now.getDate()).padStart(2, "0")).replace(/\{primary\}\/index\.md$/, "").replace(/\{primary\}.*$/, "");
  let edited = false;
  const nameField = section.fields.find((f) => f.name === (section.primary || "title"));
  const nameLabel = nameField?.label ? tl(nameField.label) : t("Title");
  // a section with a full title (longTitle / fullTitle, like projects): ask for both. The full
  // title is the heading of its page; the short one is for lists, and the permalink is made
  // from it. Only one given: it's the title, and the page uses it as its heading too.
  const fullField = section.fields.find((f) => ["longTitle", "fullTitle"].includes(f.name) && (!f.type || f.type === "string"));
  const follow = () => { if (!edited) link.value = slugify((fullField && short.value.trim()) || title.value); };
  const title = h("input", { class: "field-input", placeholder: fullField ? tl(fullField.label || "Full title") : nameLabel, "aria-label": fullField ? tl(fullField.label || "Full title") : nameLabel, oninput: follow });
  const short = fullField ? h("input", { class: "field-input", placeholder: t("{label} (optional)", { label: nameLabel }), "aria-label": nameLabel, oninput: follow }) : null;
  const link = h("input", { class: "field-input permalink-input", placeholder: t("made from the title"), "aria-label": t("Permalink"),
    oninput: () => { edited = link.value.trim() !== ""; },
    onblur: () => { link.value = slugify(link.value); if (!link.value) { edited = false; follow(); } } });
  const go = async () => {
    const full = title.value.trim(), shortName = short?.value.trim() || "";
    if (!full && !shortName) return title.focus();
    // both: short title + full title; just one: that's the title
    const name = shortName || full;
    const extra = fullField && shortName && full && full !== shortName ? { [fullField.name]: full } : {};
    overlay.remove();
    try {
      const created = await api.create(section.name, name, slugify(link.value) || slugify(name), extra);
      await loadList(section.name, true);
      location.hash = editHref(created.file);
    } catch (e) { toast(e.message, "error"); }
  };
  for (const el of [title, short, link].filter(Boolean)) el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") overlay.remove(); });
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h("div", { class: "dialog" }, h("p", { class: "dialog-title" }, t("New {kind}", { kind: singular })),
      title, short,
      hasLink ? h("label", { class: "permalink" }, h("span", { class: "field-label" }, t("Permalink")),
        h("span", { class: "permalink-row" }, h("span", { class: "permalink-base" }, base), link, h("span", { class: "permalink-base" }, "/"))) : null,
      h("p", { class: "muted small" }, isList ? t("It goes at the top of the list; drag it to where it belongs.") + (hasLink ? " " + t("The permalink follows the title unless you change it.") : "")
        : fullField ? t("The full title is the heading of its page; the short title is for lists, and the permalink follows it (or the full title) unless you change it.")
        : t("The permalink follows the title unless you change it. New posts start as drafts.")),
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
    h("div", { class: "toolbar-name" }, route.page === "images" ? t("Media") : editor ? editor.title : ""), editor ? statusEl : null);

  const right = [];
  const v = currentView();
  if (editor) {
    const b = editor.blocks;
    if (b && v !== "preview" && !narrow()) {
      right.push(tbtn("insert", t("Insert a block"), () => b.insert()));
      if (b.hasPhotos()) right.push(tbtn("images", t("Add photos"), () => b.addPhotos()));
      right.push(tbtn("arrows", b.isRearranging() ? t("Done rearranging") : t("Rearrange blocks"), () => b.toggleRearrange(), { on: b.isRearranging() }));
    }
    if (!narrow() && editor.url) right.push(h("a", { class: "tbtn", href: `http://localhost:${config.preview.port}${editor.url}`, target: "_blank", rel: "noopener", "aria-label": t("Open on your site"), title: t("Open on your site (new tab)") }, icon("external")));
    right.push(tbtn(narrow() ? "info" : "inspector", showInspector ? t("Hide details") : t("Show details"), () => toggleInspector(), { on: showInspector && !narrow() }));
  }
  const more = tbtn("more", t("More"), () => popMenu(more, [
    ...(editor ? [
      { label: tl("Revert to when opened"), run: async () => { if (await editor.revert()) reopen(); } },
      ...(editor.section ? [{ label: tl("Move to Trash"), danger: true, run: async () => {
        const section = editor.section.name;
        if (await editor.remove()) { editor.destroy(); editor = null; await loadList(section, true); location.hash = "#/s/" + section; }
      } }] : []),
      "-",
    ] : []),
    { heading: t("Appearance") },
    ...[["system", tl("Match my computer")], ["light", t("Light")], ["dark", t("Dark")]].map(([m, label]) => ({ label, checked: theme() === m, run: () => setTheme(m) })),
    { label: tl("Customize…"), run: () => openAppearance() },
    "-",
    // language, how dates are written, interface size
    { label: tl("Settings…"), run: showSettings },
    { label: tl("Open another site…"), run: () => chooseSite(true) },
    { label: t("Quit w·i·p cms"), run: quit },
  ]));
  right.push(more);

  const views = editor ? segmented(t("View"), narrow() ? [["write", t("Write")], ["preview", t("Preview")]] : [["write", t("Write")], ["split", t("Split")], ["preview", t("Preview")]], v, setView) : null;
  // three slots, always: with nothing open the middle one is empty, so ⋯ stays at the right
  fill(toolbarEl, h("div", { class: "toolbar-side" }, left, title), views || h("span"), h("div", { class: "toolbar-side end" }, right));

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
// shown over the preview while it isn't ready: starting, or why it couldn't start
const previewWait = h("div", { class: "preview-wait", hidden: true });
function drawPreviewBar() {
  fill(previewpane,
    h("div", { class: "preview-bar" },
      h("span", { class: "live-dot", "aria-hidden": "true" }), previewNote,
      h("div", { class: "segmented icons", role: "group", "aria-label": t("Preview size") },
        [["full", "laptop", t("Computer")], ["phone", "phone", t("Phone")]].map(([v, ic, label]) =>
          h("button", { class: v === previewSize ? "on" : "", "aria-label": label, title: label, onclick: () => { previewSize = v; pref.set("preview-size", v); drawPreviewBar(); } }, icon(ic)))),
      tbtn("refresh", t("Reload preview"), () => { if (previewFrame.dataset.url) previewFrame.src = previewFrame.dataset.url; })),
    h("div", { class: "preview-stage" + (previewSize === "phone" ? " phone" : "") }, previewFrame, previewWait));
}
drawPreviewBar();

const LIVE = t("Live: shows changes as you type");
let draftTimer = null;
function wirePreview() {
  if (!editor) return;
  const url = `http://localhost:${config.preview.port}${editor.url || "/"}`;
  const st = config.preview.status;
  if (st === "ready" && previewFrame.dataset.url !== url) { previewFrame.dataset.url = url; previewFrame.src = url; }
  previewNote.textContent = st === "ready" ? LIVE : st === "starting" ? t("Starting the preview…") : config.preview.message || t("The preview isn't running.");
  previewWait.hidden = st === "ready";
  previewWait.textContent = st === "starting" ? t("Starting the preview… The first time can take a little while.")
    : config.preview.message || t("The preview isn't running. Quit w·i·p cms from the ⋯ menu and open it again to restart it.");
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
// Keep an eye on the preview: it may still be starting, restart after an update, or move to
// another port. Whenever it becomes ready (again), the preview pane reloads, so it never sits
// on a "can't connect" page.
async function waitForPreview() {
  let was = config.preview.status + config.preview.port;
  const check = async () => {
    try { config.preview = await api.preview(); } catch { return; }
    const now = config.preview.status + config.preview.port;
    if (now !== was) {
      was = now;
      previewFrame.dataset.url = "";      // load it again, even at the same address
      if (editor && currentView() !== "write") wirePreview();
      else if (editor) previewNote.textContent = config.preview.status === "ready" ? LIVE : previewNote.textContent;
    }
  };
  for (let i = 0; i < 90 && config.preview.status === "starting"; i++) { await new Promise((r) => setTimeout(r, 1000)); await check(); }
  setInterval(check, 5000);
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
    const section = config.sections.find((s) => s.kind === "collection" && (s.store === "list" ? value.startsWith(s.path + "#") : value.startsWith(s.path + "/")));
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
  document.title = `${editor ? editor.title + " · " : ""}${config.site.name} · w·i·p cms`;
}
async function reopen() { editor?.destroy(); editor = null; await go(); }

// ---------- files dragged in from Finder ----------
// Anywhere on a post: pictures become image blocks, videos video blocks, other files links,
// dropped where the blue line shows. Image fields and the image library take their own drops.
// (Files are never opened by the browser itself, which would leave w·i·p cms.)
let dropHint = null, dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
function clearFileDrag() {
  dragDepth = 0;
  dropHint?.remove(); dropHint = null;
  app.classList.remove("file-over");
  editor?.blocks?.hideDrop();
}
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  if (!dropHint && editor?.blocks) {
    dropHint = h("div", { class: "file-drop-hint" }, h("b", {}, t("Drop to add to this post")), t("Pictures become image blocks, videos become video blocks, other files become links."));
    document.body.append(dropHint);
    app.classList.add("file-over");
  }
});
window.addEventListener("dragleave", (e) => { if (hasFiles(e) && --dragDepth <= 0) clearFileDrag(); });
window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (editor?.blocks && docpane.contains(e.target)) editor.blocks.showDropAt(e.clientY);
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const b = editor?.blocks;
  const at = b && docpane.contains(e.target) ? b.showDropAt(e.clientY) : undefined;
  clearFileDrag();
  if (route.page === "images") return;          // the library page handles its own drops
  if (!editor) return;
  if (!b) return toast(t("This page has no blocks: drop pictures onto an image field instead."), "error");
  b.addFiles([...e.dataTransfer.files], at);
});

function showSettings() {
  openSettings({
    beforeReload: () => editor?.flush(),
    onDates: () => { drawList(); editor?.redrawMeta?.(); },
    site: config.site,
    openSite: () => chooseSite(true),
    onRename: () => { drawSidebar(); document.title = `${editor ? editor.title + " · " : ""}${config.site.name} · w·i·p cms`; },
  });
}

// after adding a collection or page: reload (the sidebar comes from .pages.yml), open it, and
// say what the site itself still needs
function sectionAdded(made) {
  try { sessionStorage.setItem("wip-added", JSON.stringify(made)); } catch { /* fine */ }
  location.hash = made.kind === "collection" ? "#/s/" + made.name : "#/edit/" + made.path;
  location.reload();
}
function showAdded() {
  let made = null;
  try { made = JSON.parse(sessionStorage.getItem("wip-added") || "null"); sessionStorage.removeItem("wip-added"); } catch { /* fine */ }
  if (!made) return;
  const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog" },
    h("p", { class: "dialog-title" }, made.kind === "collection" ? t("Collection added") : t("Page added")),
    h("p", { class: "small" }, t("It's in .pages.yml and ready to write in.")),
    h("p", { class: "muted small" }, made.next),
    h("div", { class: "dialog-buttons" }, h("button", { class: "btn primary", onclick: () => overlay.remove() }, t("OK")))));
  document.body.append(overlay);
}

// ---------- quitting ----------
// saves, stops the editor (and its preview), and says so; open the Mac app again to restart
async function quit() {
  await editor?.flush();
  try { await api.quit(); } catch { /* it stops before answering, sometimes */ }
  document.body.append(h("div", { class: "overlay" }, h("div", { class: "dialog" },
    h("p", { class: "dialog-title" }, t("w·i·p cms has stopped")),
    h("p", { class: "muted small" }, t("Everything is saved. You can close this window; open w·i·p cms again when you need it.")))));
}

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
      // not set up for w·i·p cms yet: offer to set it up
      if (!info.hasConfig) { overlay.remove(); openSetup(info, () => chooseSite(canCancel)); return; }
      await editor?.flush();
      await api.openSite(path);
      location.hash = "";
      location.reload();
    } catch (e) { err.textContent = e.message; }
  };
  // a recent site: its nickname (or folder name) and path; the pencil gives it a nickname
  const recentRow = (r) => {
    const row = h("div", { class: "recent-site" },
      h("button", { class: "recent-open", onclick: () => open(r.path) }, icon("folder"),
        h("span", { class: "recent-text" }, h("b", {}, r.nickname || r.folder), h("span", { class: "muted" }, r.path + "\u200e"))),
      h("button", { class: "icon-btn", title: t("Give it a nickname"), onclick: () => rename() }, icon("compose")));
    const rename = () => {
      const input = h("input", { class: "field-input", value: r.nickname, placeholder: r.folder, "aria-label": t("Nickname") });
      const save = async () => {
        try { const res = await api.setNickname(r.path, input.value); r.nickname = res.nickname; } catch (e) { toast(e.message, "error"); }
        if (site && site.root === r.path) { config.site.name = r.nickname || r.folder; drawSidebar(); }
        row.replaceWith(recentRow(r));
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") row.replaceWith(recentRow(r)); });
      input.addEventListener("blur", save);
      fill(row, icon("folder"), h("span", { class: "recent-text" }, input, h("span", { class: "muted" }, r.path)));
      input.focus(); input.select();
    };
    return row;
  };
  const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog wide" },
    h("p", { class: "dialog-title" }, t("Open a site")),
    h("p", { class: "muted small" }, t("The site's main folder. In Finder, select the folder and press ⌥⌘C to copy its path, then paste it here. A folder that isn't set up for w·i·p cms yet (a new client site, say) gets a few questions first.")),
    input, err,
    recent.length ? h("div", { class: "recent" }, h("p", { class: "muted small" }, t("Recent")), recent.map(recentRow)) : null,
    h("div", { class: "dialog-buttons" },
      canCancel ? h("button", { class: "btn", onclick: () => overlay.remove() }, t("Cancel")) : null,
      h("button", { class: "btn primary", onclick: () => open(input.value.trim()) }, t("Open")))));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") open(input.value.trim()); });
  document.body.append(overlay);
  input.focus();
}

// ---------- start ----------

// After an update (a pull in GitHub Desktop) the page is new but the server may still be the
// old one: restart it before anything else, so the two always match.
async function updateServerIfNeeded() {
  let v;
  try { v = await api.version(); } catch { return; }
  if (!v.stale) return;
  document.body.append(h("div", { class: "overlay" }, h("div", { class: "dialog" }, h("p", { class: "dialog-title" }, t("Finishing an update…")),
    h("p", { class: "muted small" }, t("w·i·p cms was updated. It's restarting to use the new version; this takes a few seconds.")))));
  try { await api.restart(); } catch { /* it stops before answering, sometimes */ }
  await new Promise((r) => setTimeout(r, 800));
  for (let i = 0; i < 60; i++) {
    try { const now = await api.version(); if (!now.stale) break; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  location.reload();
  await new Promise(() => {});   // wait for the reload
}

(async () => {
  await updateServerIfNeeded();
  const { site } = await api.site();
  if (!site) { app.hidden = true; await chooseSite(false); return; }
  // the site's settings can't be read (moved, or .pages.yml deleted): pick a site again
  try { config = await api.config(); } catch (e) { app.hidden = true; await chooseSite(false); toast(t("Couldn't read that site's settings (.pages.yml), so pick a site to open."), "error"); return; }
  setMediaRoot(config.site.mediaInput, config.site.mediaSources);
  if (narrow()) showInspector = false;
  await Promise.all(config.sections.filter((s) => s.kind === "collection").map((s) => loadList(s.name).catch(() => {})));
  window.addEventListener("hashchange", go);
  let wasNarrow = narrow();
  window.addEventListener("resize", () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); layout(); } });
  await go();
  refreshChanges();
  setInterval(refreshChanges, 15000);
  // updated while the window is open: save, then restart onto the new version
  setInterval(async () => { try { if ((await api.version()).stale) { await editor?.flush(); updateServerIfNeeded(); } } catch { /* offline */ } }, 20000);
  waitForPreview();
  showAdded();
  // Settings → When w·i·p cms opens → Show the list of sites: once per window (not on every reload)
  try {
    if (onLaunch() === "list" && !sessionStorage.getItem("wip-launched")) chooseSite(true);
    sessionStorage.setItem("wip-launched", "1");
  } catch { /* fine */ }
})();
