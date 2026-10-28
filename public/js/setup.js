// The "Set up a site" window: for a folder without a .pages.yml (a new client site, say).
// You choose the sections (posts, pages, case studies...), and lib/setup.js writes the
// .pages.yml and makes the folders.
import { h, fill, icon } from "./util.js";
import { api } from "./api.js";

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
      h("div", { class: "setup-row setup-row-head", "aria-hidden": "true" }, h("span", {}, "Name in the sidebar"), h("span", {}, "Folder"), h("span", {}, "Kind"), h("span", {}, "Writing"), h("span", {}, "Template"), h("span", {})),
      rows.map((r, i) => {
        const folder = h("input", { class: "field-input", value: r.folder, "aria-label": "Folder", oninput: () => { r.folder = folder.value; r.folderEdited = true; } });
        const label = h("input", { class: "field-input", value: r.label, "aria-label": "Name in the sidebar", oninput: () => {
          r.label = label.value;
          if (!r.folderEdited) { r.folder = label.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); folder.value = r.folder; }
        } });
        const pick = (field, value) => { r[field] = value; draw(); };
        return h("div", { class: "setup-row" },
          label, folder,
          h("div", { class: "segmented small", role: "group", "aria-label": "Kind" },
            [["dated", "Posts"], ["pages", "Pages"]].map(([v, t]) => h("button", { class: r.kind === v ? "on" : "", "aria-pressed": String(r.kind === v), title: v === "dated" ? "Title, featured image, date, draft, tags" : "Title and a short description", onclick: () => pick("kind", v) }, t))),
          h("div", { class: "segmented small", role: "group", "aria-label": "Writing" },
            [["text", "Text"], ["blocks", "Blocks"]].map(([v, t]) => h("button", { class: r.content === v ? "on" : "", "aria-pressed": String(r.content === v), title: v === "text" ? "One piece of writing under the title (Markdown)" : "Text, images, carousels, collages… (the site's templates must show blocks)", onclick: () => pick("content", v) }, t))),
          h("input", { class: "field-input", value: r.template, placeholder: "optional", "aria-label": "Template", oninput: (e) => { r.template = e.target.value; } }),
          h("button", { class: "icon-btn", "aria-label": `Remove ${r.label}`, onclick: () => { rows.splice(i, 1); draw(); } }, icon("x")));
      }),
      h("button", { class: "btn small", onclick: () => { rows.push({ label: "", folder: "", kind: "dated", content: "text", template: "" }); draw(); list.querySelector(".setup-row:last-of-type input")?.focus(); } }, icon("plus"), "Add a section"));
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
    h("p", { class: "dialog-title" }, `Set up “${name}”`),
    h("p", { class: "muted small" },
      info.generator ? `This looks like ${/^[AEIOU]/.test(info.generator) ? "an" : "a"} ${info.generator} site. ` : "",
      "wip cms will write a .pages.yml file describing the sections below, and make their folders. Each post or page becomes its own folder with an index.md inside. You can change all of this later in .pages.yml."),
    h("div", { class: "setup-paths" },
      h("label", {}, h("span", { class: "field-label" }, "Pages folder (the site generator's input)"), source),
      h("label", {}, h("span", { class: "field-label" }, "Images folder, inside it"), images)),
    info.folders.length ? h("p", { class: "muted small" }, "Folders already there: ", info.folders.join(", ")) : null,
    h("div", { class: "field-label" }, "Sections"),
    list,
    h("p", { class: "muted small" },
      "Posts get a title, featured image, date, draft switch and tags; pages get a title and a description. “Blocks” lets you mix text, images, carousels and collages, like your own site, but the client site's templates need to be able to show them. “Template” fills in the layout field (for Eleventy, e.g. post.njk)."),
    err,
    h("div", { class: "dialog-buttons" },
      h("button", { class: "btn", onclick: () => { overlay.remove(); back(); } }, "Back"),
      h("button", { class: "btn primary", onclick: create }, "Set up"))));
  document.body.append(overlay);
}
