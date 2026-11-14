// Check content: pictures nothing uses, pictures without alt text, and slips in the writing
// (leftover ** marks, double spaces).
// Unused pictures can be moved to the Trash (they're kept there, as with any Trash).
import { h, fill, icon, toast, confirmBox, env, pageTitle } from "./util.js";
import { api } from "./api.js";
import { t, t2, tl } from "./i18n.js";

const size = (n) => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";

export function auditView({ onOpen, onTrashed = () => {} }) {
  const body = h("div", { class: "trash-body" }, h("p", { class: "muted picker-empty" }, t("Checking…")));
  const el = h("div", { class: "library trash-page" },
    pageTitle(tl("Check content")),
    body);
  let data = null;
  const chosen = new Set();
  let tab = "marks";

  async function load() {
    try { data = await api.audit(); } catch (e) { return fill(body, h("p", { class: "muted picker-empty" }, e.message)); }
    chosen.clear();
    draw();
  }

  // put right a kind of slip, in the named items or in all of them, with an Undo
  async function fixWriting(kind, files) {
    try {
      const r = await api.fixWriting(kind, files);
      toast(r.fixed ? t2(r.fixed, "Fixed {n} item", "Fixed {n} items") : t("Nothing to fix here."), "", r.fixed ? { action: { label: t("Undo"), run: async () => { try { await api.undoFixWriting(); toast(t("Put back")); } catch (e) { toast(e.message, "error"); } load(); } } } : {});
      onTrashed();
    } catch (e) { toast(e.message, "error"); }
    load();
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
    const { unused, missingAlt, writing = [] } = data;
    const withKind = (kind) => writing.map((w) => ({ ...w, issues: w.issues.filter((i) => i.kind === kind) })).filter((w) => w.issues.length);
    const fixLabel = (kind) => kind === "marks" ? t("Fix") : t("Fix");
    const writingRows = (kind, rows) => rows.map((m) => h("div", { class: "trash-row audit-fixrow" },
      h("button", { class: "search-row audit-open", onclick: () => onOpen(m, m.issues[0].needle) },
        h("span", { class: "trash-text" },
          h("span", { class: "trash-title" }, m.title),
          h("span", { class: "muted small trash-was" }, tl(m.sectionLabel) + " · " + (m.issues[0].field === "body" ? t("Text") : m.issues[0].field) + (m.issues.length > 1 ? " +" + (m.issues.length - 1) : "")),
          h("span", { class: "small trash-was audit-sample" }, m.issues[0].sample))),
      env.remote ? null : h("button", { class: "btn small", onclick: () => fixWriting(kind, [m.file]) }, fixLabel(kind))));
    const fixAll = (kind, rows) => env.remote || rows.length < 2 ? null : h("div", { class: "audit-actions" },
      h("button", { class: "btn small", onclick: () => fixWriting(kind, null) }, t2(rows.length, "Fix {n} item", "Fix all {n} items")));
    const marks = withKind("marks"), spaces = withKind("spaces");
    const panels = {
      marks: () => marks.length ? [
        h("p", { class: "muted small picker-tip" }, t("Marks like ** that were typed but didn't turn into bold or italic.")),
        fixAll("marks", marks),
        writingRows("marks", marks),
      ] : h("p", { class: "muted picker-tip" }, t("No stray marks found.")),
      spaces: () => spaces.length ? [
        h("p", { class: "muted small picker-tip" }, t("Two or more spaces in a row, shown here as ␣.")),
        fixAll("spaces", spaces),
        writingRows("spaces", spaces),
      ] : h("p", { class: "muted picker-tip" }, t("No double spaces found.")),
      unused: () => unused.length ? [
        h("p", { class: "muted small picker-tip" }, t("No post, page, data file or template mentions these. Check one before trashing it if your site finds pictures some other way.")),
        unused.map((u) => h("label", { class: "trash-row audit-row" },
          h("input", { type: "checkbox", checked: chosen.has(u.url), onchange: (e) => { e.target.checked ? chosen.add(u.url) : chosen.delete(u.url); draw(); } }),
          h("span", { class: "media-thumb" }, h("img", { src: u.url, alt: "", loading: "lazy" })),
          h("span", { class: "trash-text" }, h("span", { class: "trash-title" }, u.name), h("span", { class: "muted small trash-was" }, u.folder + " · " + size(u.size))))),
        env.remote ? null : h("div", { class: "audit-actions" },
          h("button", { class: "btn small", disabled: !chosen.size, onclick: trashChosen }, icon("trash"), chosen.size ? t2(chosen.size, "Move {n} to Trash", "Move {n} to Trash") : tl("Move to Trash")),
          h("button", { class: "btn small", onclick: () => { unused.forEach((u) => chosen.add(u.url)); draw(); } }, t("Select all"))),
      ] : h("p", { class: "muted picker-tip" }, t("Every picture is used.")),
      alt: () => missingAlt.length ? [
        h("p", { class: "muted small picker-tip" }, t("Alt text describes a picture for people using screen readers. A purely decorative picture can go without.")),
        missingAlt.map((m) => h("button", { class: "trash-row search-row", onclick: () => onOpen(m) },
          h("span", { class: "trash-text" },
            h("span", { class: "trash-title" }, m.title),
            h("span", { class: "muted small trash-was" }, tl(m.sectionLabel) + " · " + t2(m.pictures.length, "{n} picture", "{n} pictures") + " · " + m.pictures.slice(0, 2).map((p) => p.split("/").pop()).join(", "))))),
      ] : h("p", { class: "muted picker-tip" }, t("No pictures are missing alt text.")),
    };
    const tabs = [["marks", t("Stray formatting"), marks.length], ["spaces", t("Double spaces"), spaces.length], ["unused", t("Unused images"), unused.length], ["alt", t("No alt text"), missingAlt.length]];
    fill(body,
      h("div", { class: "segmented audit-tabs", role: "tablist" }, tabs.map(([k, label, n]) =>
        h("button", { role: "tab", class: tab === k ? "on" : "", "aria-selected": String(tab === k), onclick: () => { tab = k; draw(); } }, label, n ? h("span", { class: "audit-count" }, String(n)) : null))),
      panels[tab]());
  }
  load();
  return { el, refresh: load };
}
