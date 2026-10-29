// The "Set up a site" window: for a folder without a .pages.yml (a new client site, say).
// You choose the sections (posts, pages, case studies...), and lib/setup.js writes the
// .pages.yml and makes the folders.
import { h, fill, icon } from "./util.js";
import { api } from "./api.js";
import { t as tr, tl } from "./i18n.js";

const POSTY = ["blog", "posts", "news", "journal", "work", "projects", "case-studies", "portfolio"];

// info: what GET /api/site/inspect found. back(): return to "Open a site".
export function openSetup(info, back) {
  const name = info.root.split("/").filter(Boolean).pop();
  const source = h("input", { class: "field-input", value: info.source, "aria-label": "Pages folder" });
  const images = h("input", { class: "field-input", value: info.images, "aria-label": "Images folder" });
  const err = h("p", { class: "error-text small" });

  // starting sections: the folders that look like posts, else posts + pages
  const found = info.folders.filter((f) => POSTY.includes(f.toLowerCase()));
  const rows = found.length
    ? found.map((f) => ({ label: f.replace(/-/g, " "), folder: f, kind: "dated", content: "text", template: "" }))
    : [{ label: "posts", folder: "posts", kind: "dated", content: "text", template: "" }];
  rows.push({ label: "pages", folder: "pages", kind: "pages", content: "text", template: "" });

  const list = h("div", { class: "setup-rows" });
  const draw = () => {
    fill(list,
      h("div", { class: "setup-row setup-row-head", "aria-hidden": "true" }, h("span", {}, tl("Name in the sidebar")), h("span", {}, tl("Folder")), h("span", {}, tl("Kind")), h("span", {}, tl("Writing")), h("span", {}, tl("Template")), h("span", {})),
      rows.map((r, i) => {
        const folder = h("input", { class: "field-input", value: r.folder, "aria-label": tr("Folder"), oninput: () => { r.folder = folder.value; r.folderEdited = true; } });
        const label = h("input", { class: "field-input", value: r.label, "aria-label": tr("Name in the sidebar"), oninput: () => {
          r.label = label.value;
          if (!r.folderEdited) { r.folder = label.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); folder.value = r.folder; }
        } });
        const pick = (field, value) => { r[field] = value; draw(); };
        return h("div", { class: "setup-row" },
          label, folder,
          h("div", { class: "segmented small", role: "group", "aria-label": tr("Kind") },
            [["dated", tr("Posts")], ["pages", tr("Pages")]].map(([v, text]) => h("button", { class: r.kind === v ? "on" : "", "aria-pressed": String(r.kind === v), title: v === "dated" ? tr("Title, featured image, date, draft, tags") : tr("Title and a short description"), onclick: () => pick("kind", v) }, text))),
          h("div", { class: "segmented small", role: "group", "aria-label": tr("Writing") },
            [["text", tr("Text")], ["blocks", tr("Blocks")]].map(([v, text]) => h("button", { class: r.content === v ? "on" : "", "aria-pressed": String(r.content === v), title: v === "text" ? tr("One piece of writing under the title (Markdown)") : tr("Text, images, carousels, collages… (the site's templates must show blocks)"), onclick: () => pick("content", v) }, text))),
          h("input", { class: "field-input", value: r.template, placeholder: tr("optional"), "aria-label": tr("Template"), oninput: (e) => { r.template = e.target.value; } }),
          h("button", { class: "icon-btn", "aria-label": tr("Remove {label}", { label: r.label }), onclick: () => { rows.splice(i, 1); draw(); } }, icon("x")));
      }),
      h("button", { class: "btn small", onclick: () => { rows.push({ label: "", folder: "", kind: "dated", content: "text", template: "" }); draw(); list.querySelector(".setup-row:last-of-type input")?.focus(); } }, icon("plus"), tr("Add a section")));
  };
  draw();

  const create = async () => {
    err.textContent = "";
    try {
      await api.setupSite(info.root, { source: source.value.trim() || ".", images: images.value.trim() || "images", sections: rows });
      location.hash = "";
      location.reload();
    } catch (e) { err.textContent = e.message; }
  };

  const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog setup" },
    h("p", { class: "dialog-title" }, tr("Set up “{name}”", { name })),
    h("p", { class: "muted small" },
      info.generator ? tr(/^[AEIOU]/.test(info.generator) ? "This looks like an {generator} site. " : "This looks like a {generator} site. ", { generator: info.generator }) : "",
      tr("w·i·p cms will write a .pages.yml file describing the sections below, and make their folders. Each post or page becomes its own folder with an index.md inside. You can change all of this later in .pages.yml.")),
    h("div", { class: "setup-paths" },
      h("label", {}, h("span", { class: "field-label" }, tl("Pages folder (the site generator's input)")), source),
      h("label", {}, h("span", { class: "field-label" }, tl("Images folder, inside it")), images)),
    info.folders.length ? h("p", { class: "muted small" }, tr("Folders already there: {list}", { list: info.folders.join(", ") })) : null,
    h("div", { class: "field-label" }, tl("Sections")),
    list,
    h("p", { class: "muted small" },
      tr("Posts get a title, featured image, date, draft switch and tags; pages get a title and a description. “Blocks” lets you mix text, images, carousels and collages, like your own site, but the client site's templates need to be able to show them. “Template” fills in the layout field (for Eleventy, e.g. post.njk).")),
    err,
    h("div", { class: "dialog-buttons" },
      h("button", { class: "btn", onclick: () => { overlay.remove(); back(); } }, tr("Back")),
      h("button", { class: "btn primary", onclick: create }, tr("Set up")))));
  document.body.append(overlay);
}
