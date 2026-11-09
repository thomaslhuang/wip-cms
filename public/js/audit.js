// Check pictures (Media page): pictures nothing uses, and pictures without alt text.
// Unused pictures can be moved to the Trash (they're kept there, as with any Trash).
import { h, fill, icon, toast, confirmBox, env } from "./util.js";
import { api } from "./api.js";
import { t, t2, tl } from "./i18n.js";

const size = (n) => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";

export function auditView({ onOpen, onTrashed = () => {} }) {
  const body = h("div", { class: "trash-body" }, h("p", { class: "muted picker-empty" }, t("Checking…")));
  const el = h("div", { class: "library trash-page" },
    h("div", { class: "picker-head" }, h("div", { class: "picker-crumbs" }, h("b", {}, tl("Check pictures")))),
    body);
  let data = null;
  const chosen = new Set();

  async function load() {
    try { data = await api.audit(); } catch (e) { return fill(body, h("p", { class: "muted picker-empty" }, e.message)); }
    chosen.clear();
    draw();
  }

  async function trashChosen() {
    const urls = [...chosen];
    if (!urls.length) return;
    if (!(await confirmBox(t2(urls.length, "Move {n} picture to the Trash? It goes into the .cms-trash folder in your site, so you can get it back.", "Move {n} pictures to the Trash? They go into the .cms-trash folder in your site, so you can get them back."), tl("Move to Trash")))) return;
    try { await api.trashMedia(urls); toast(t2(urls.length, "Moved {n} picture to .cms-trash", "Moved {n} pictures to .cms-trash")); await onTrashed(); }
    catch (e) { toast(e.message, "error"); }
    load();
  }

  function draw() {
    const { unused, missingAlt } = data;
    fill(body,
      h("div", { class: "trash-when" }, t("Pictures nothing uses")),
      unused.length ? [
        h("p", { class: "muted small picker-tip" }, t("No post, page, data file or template mentions these. Check one before trashing it if your site finds pictures some other way.")),
        unused.map((u) => h("label", { class: "trash-row audit-row" },
          h("input", { type: "checkbox", checked: chosen.has(u.url), onchange: (e) => { e.target.checked ? chosen.add(u.url) : chosen.delete(u.url); draw(); } }),
          h("span", { class: "media-thumb" }, h("img", { src: u.url, alt: "", loading: "lazy" })),
          h("span", { class: "trash-text" }, h("span", { class: "trash-title" }, u.name), h("span", { class: "muted small trash-was" }, u.folder + " · " + size(u.size))))),
        env.remote ? null : h("div", { class: "audit-actions" },
          h("button", { class: "btn small", disabled: !chosen.size, onclick: trashChosen }, icon("trash"), chosen.size ? t2(chosen.size, "Move {n} to Trash", "Move {n} to Trash") : tl("Move to Trash")),
          h("button", { class: "btn small", onclick: () => { unused.forEach((u) => chosen.add(u.url)); draw(); } }, t("Select all"))),
      ] : h("p", { class: "muted picker-tip" }, t("Every picture is used.")),
      h("div", { class: "trash-when" }, t("Pictures without alt text")),
      missingAlt.length ? [
        h("p", { class: "muted small picker-tip" }, t("Alt text describes a picture for people using screen readers. A purely decorative picture can go without.")),
        missingAlt.map((m) => h("button", { class: "trash-row search-row", onclick: () => onOpen(m) },
          h("span", { class: "trash-text" },
            h("span", { class: "trash-title" }, m.title),
            h("span", { class: "muted small trash-was" }, tl(m.sectionLabel) + " · " + t2(m.pictures.length, "{n} picture", "{n} pictures") + " · " + m.pictures.slice(0, 2).map((p) => p.split("/").pop()).join(", "))))),
      ] : h("p", { class: "muted picker-tip" }, t("No pictures are missing alt text.")));
  }
  load();
  return { el, refresh: load };
}
