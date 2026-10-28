// One open post, project or page.
//
// Builds what goes into the Details and Content panels, and the Save / View / Delete
// buttons for the top bar. The app (app.js) puts them in place.
//   Details:  everything except the blocks (title, featured image, date, tags...)
//   Content:  the blocks; pages without blocks show all their fields here instead
import { h, icon, toast, confirmBox } from "./util.js";
import { api } from "./api.js";
import { renderField } from "./fields.js";

// fields arranged together at the top: featured image beside the date, with two
// switches side by side under the date (draft / square preview, or ongoing / book)
const ROLES = { featuredImage: "image", date: "date", draft: "t1", ongoing: "t1", squarePreview: "t2", isBook: "t2" };
// fields this editor doesn't need (Pages CMS-only helpers)
const SKIP = new Set(["newTags"]);

export async function openEditor({ file, section, config, onDelete }) {
  const entry = await api.read(file);
  const data = entry.data;
  // tags typed into "new tags" in Pages CMS that haven't been merged yet
  if (typeof data.newTags === "string" && data.newTags.trim()) {
    data.tags = [...new Set([...(data.tags || []), ...data.newTags.split(",").map((t) => t.trim()).filter(Boolean)])];
  }
  delete data.newTags;

  // ----- saving -----
  let dirty = false;
  const changeListeners = new Set();
  const status = h("span", { class: "status muted" }, "");
  const saveBtn = h("button", { class: "btn primary", disabled: true, title: "Save (⌘S)", onclick: () => save() }, icon("save"), h("span", { class: "label" }, "Save"));
  const changed = () => {
    if (!dirty) { dirty = true; status.textContent = "Unsaved changes"; saveBtn.disabled = false; }
    changeListeners.forEach((fn) => fn());
  };
  async function save() {
    if (!dirty) return;
    saveBtn.disabled = true;
    status.textContent = "Saving…";
    try {
      await api.save(file, data, entry.body);
      dirty = false;
      status.textContent = "Saved";
      toast("Saved");
      if (data.tags) config.tags = [...new Set([...(config.tags || []), ...data.tags])];
    } catch (e) {
      saveBtn.disabled = false;
      status.textContent = "Not saved";
      toast(e.message, "error");
    }
  }

  // the post's own image folder: uploads go there, and the picker opens there
  const imageFolder = section
    ? (await api.imageFolder(file)).folder
    : `${config.site.mediaInput}/${(file.match(/([^/]+)\.json$/) || [, ""])[1]}`.replace(/\/$/, "");
  const ctx = { changed, imageFolder, tags: config.tags };

  // ----- the two panels' contents -----
  const fields = (section ? section.fields : config.sections.find((s) => s.path === file)?.fields) || [];
  const blockField = fields.find((f) => f.type === "block");
  const settings = h("div", { class: "settings-grid" });
  for (const f of fields) {
    if (f === blockField || SKIP.has(f.name)) continue;
    const el = renderField(f, data, ctx);
    if (!el) continue;
    if (ROLES[f.name]) el.classList.add("role-" + ROLES[f.name]);
    settings.append(el);
  }
  settings.classList.toggle("entry-layout", !!(settings.querySelector(".role-date") && settings.querySelector(".role-t1")));

  const details = h("div", { class: "panel-pad" }, blockField ? settings : h("p", { class: "muted" }, "This page's fields are in the Content panel."));
  const content = h("div", { class: "panel-pad" }, blockField ? renderField(blockField, data, ctx) : settings);

  // ----- top bar buttons -----
  const actions = [status];
  if (entry.url) {
    actions.push(h("a", { class: "btn ghost", href: `http://localhost:${config.preview.port}${entry.url}`, target: "_blank", rel: "noopener",
      title: "Open this page in a browser tab (shows your unsaved changes too)" }, icon("external"), h("span", { class: "label" }, "Open")));
  }
  actions.push(saveBtn);
  if (section) {
    const menu = h("div", { class: "menu", hidden: true },
      h("button", { onclick: async () => {
        menu.hidden = true;
        if (!(await confirmBox(`Delete "${data.title || file}"? It's moved to the .cms-trash folder in the site, so you can get it back.`, "Delete"))) return;
        await api.remove(file);
        dirty = false;
        toast("Moved to .cms-trash");
        onDelete?.();
      } }, icon("trash"), "Delete"));
    const more = h("button", { class: "btn ghost", title: "More", onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, icon("more"));
    document.addEventListener("click", () => { menu.hidden = true; });
    actions.push(h("div", { class: "menu-wrap" }, more, menu));
  }

  // ⌘S / Ctrl+S saves; leaving with unsaved changes asks first
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
  document.addEventListener("keydown", onKey);
  const onLeave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", onLeave);

  return {
    file, url: entry.url || guessPageUrl(file), title: data.title || null,
    data, body: entry.body,
    details, content, actions,
    isDirty: () => dirty,
    onChange: (fn) => changeListeners.add(fn),
    destroy: () => { document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); },
  };
}

// pages kept in data files (home.json, about.json): which page shows them
function guessPageUrl(file) {
  const name = (file.match(/([^/]+)\.json$/) || [])[1];
  if (!name) return "/";
  return name === "home" || name === "index" ? "/" : `/${name}/`;
}
