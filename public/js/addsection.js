// The "Add a collection or page" window (the + at the bottom of the sidebar).
//
// Sites keep their content in different ways (studiotomby: a folder of Markdown files per
// collection, pages as data files; dosa: everything as lists in data files), so the window
// starts from what this site already does: a new collection copies the fields, and the way
// of keeping them, of one that's already there. Everything can be changed before adding.
// The server side is lib/sections.js.
import { h, fill, toast } from "./util.js";
import { api } from "./api.js";
import { t, tl } from "./i18n.js";

const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function openAddSection(onAdded) {
  const opts = await api.sectionOptions();
  const root = opts.contentRoot === "." ? "" : opts.contentRoot + "/";
  const state = { kind: "collection", label: "", fieldsFrom: null, store: null, content: "text", group: opts.groups[0] || "", path: "", pathEdited: false };

  const same = (kind) => opts.sections.filter((s) => (kind === "collection" ? s.kind === "collection" : s.kind !== "collection"));
  // a page's way of being kept: a Markdown file, or a data file
  const storeOf = (s) => (s.kind === "collection" ? s.store : /\.md$/.test(s.path) ? "md" : "json");
  const pickDefaults = () => {
    const first = same(state.kind)[0];
    state.fieldsFrom = first ? first.name : state.kind === "collection" ? "posts" : "simple";
    state.store = first ? storeOf(first) : state.kind === "collection" ? "files" : "md";
    if (state.kind === "page" && first) state.group = first.group || "";
  };
  const defaultPath = () => {
    const name = slug(state.label) || "new";
    if (state.kind === "collection") return state.store === "list" ? `${opts.dataDir}/${name}.json` : `${root}${name}`;
    return state.store === "md" ? `${root}${name}/index.md` : `${opts.dataDir}/${name}.json`;
  };
  pickDefaults();

  const body = h("div", { class: "add-body" });
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const addBtn = h("button", { class: "btn primary", onclick: () => submit() }, t("Add"));
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog wide add-dialog", role: "dialog", "aria-label": t("Add to the sidebar") },
      h("p", { class: "dialog-title" }, t("Add to the sidebar")),
      body,
      h("div", { class: "dialog-buttons" }, h("button", { class: "btn", onclick: close }, t("Cancel")), addBtn)));
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);

  const row = (label, ...control) => h("div", { class: "add-row" }, h("span", { class: "field-label" }, label), h("div", { class: "add-control" }, control));
  const choice = (options, current, onpick) => h("div", { class: "segmented small" },
    options.map(([v, text, title]) => h("button", { class: v === current ? "on" : "", "aria-pressed": String(v === current), title: title || "", onclick: () => onpick(v) }, text)));
  const select = (options, current, onpick) => h("select", { class: "input", onchange: (e) => onpick(e.target.value) },
    options.map(([v, text]) => h("option", { value: v, selected: v === current }, text)));

  let nameInput;
  function draw(focusName) {
    const isCol = state.kind === "collection";
    if (!state.pathEdited) state.path = defaultPath();
    const sources = same(state.kind);
    const fresh = state.fieldsFrom === "posts" || state.fieldsFrom === "simple";
    nameInput = h("input", { class: "field-input", value: state.label, placeholder: isCol ? t("e.g. Exhibitions") : t("e.g. Contact"),
      oninput: (e) => { state.label = e.target.value; if (!state.pathEdited) { state.path = defaultPath(); pathInput.value = state.path; } } });
    const pathInput = h("input", { class: "field-input mono", value: state.path, oninput: (e) => { state.path = e.target.value.trim(); state.pathEdited = !!state.path; } });
    fill(body,
      choice([["collection", t("Collection"), t("Many entries you keep adding to, like blog posts or projects")], ["page", t("Page"), t("One page you edit, like About")]],
        state.kind, (k) => { state.kind = k; pickDefaults(); draw(); }),
      h("p", { class: "muted small add-explain" }, isCol ? t("Many entries you keep adding to, like blog posts or projects.") : t("One page you edit, like About.")),
      row(t("Name"), nameInput),
      row(t("Fields"), select([
        ...sources.map((s) => [s.name, t("Same as {label}", { label: tl(s.label) })]),
        ...(isCol ? [["posts", t("Posts: title, picture, date, draft, tags")], ["simple", t("Simple: title and text")]] : [["simple", t("Simple: title and text")]]),
      ], state.fieldsFrom, (v) => {
        state.fieldsFrom = v;
        const src = opts.sections.find((s) => s.name === v);
        if (src) state.store = storeOf(src);
        draw();
      })),
      row(t("Kept as"), isCol
        ? choice([["files", t("Markdown files in a folder")], ["list", t("A list in one data file")]], state.store, (v) => { state.store = v; draw(); })
        : choice([["md", t("A Markdown page")], ["json", t("A data file")]], state.store, (v) => { state.store = v; draw(); })),
      isCol && fresh && state.store === "files" ? row(t("Writing"), choice([["text", t("Text")], ["blocks", t("Blocks")]], state.content, (v) => { state.content = v; draw(); })) : null,
      !isCol ? row(t("In the sidebar under"), select([...opts.groups.map((g) => [g, tl(g)]), ["", t("Site")]], state.group, (v) => { state.group = v; })) : null,
      row(t("Saved in"), pathInput),
      h("p", { class: "muted small add-explain" },
        t("w·i·p cms adds it to .pages.yml and makes a place for its content, ready to write in. The site shows it once the site's own templates do; that part is different on every site, and w·i·p cms says what's needed after adding.")));
    if (focusName) nameInput.focus();
  }

  async function submit() {
    if (!state.label.trim()) return nameInput.focus();
    addBtn.disabled = true;
    try {
      const made = await api.addSection({ kind: state.kind, label: state.label.trim(), fieldsFrom: state.fieldsFrom, store: state.store, content: state.content, group: state.group, path: state.pathEdited ? state.path : "" });
      close();
      onAdded(made);
    } catch (e) { toast(e.message, "error"); addBtn.disabled = false; }
  }
  draw(true);
}
