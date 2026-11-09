// The Changes page (the "N changes to publish" line at the bottom of the sidebar): every file
// that's different from the last commit. Read-only: publishing stays in GitHub Desktop, where
// you commit and push. Show in Finder reveals a file there (on this Mac only).
import { h, fill, icon, toast, env, pageTitle } from "./util.js";
import { api } from "./api.js";
import { t, t2, tl } from "./i18n.js";

const LABEL = { new: "New", modified: "Changed", deleted: "Deleted", renamed: "Renamed" };

export function changesView() {
  const body = h("div", { class: "trash-body" });
  const el = h("div", { class: "library trash-page" },
    pageTitle(tl("Changes")),
    body);

  async function show() {
    let data;
    try { data = await api.changes(); } catch (e) { return fill(body, h("p", { class: "muted picker-empty" }, e.message)); }
    if (data.count == null) return fill(body, h("p", { class: "muted picker-empty" }, t("This site isn't in a git folder, so there's nothing to compare with.")));
    if (!data.count) return fill(body, h("p", { class: "muted picker-empty" }, t("Everything is published.")));
    fill(body,
      h("div", { class: "trash-when" }, t2(data.count, "{n} file changed since the last commit", "{n} files changed since the last commit")),
      data.files.map((f) => h("div", { class: "trash-row" },
        h("span", { class: "change-status " + f.status }, t(LABEL[f.status] || "Changed")),
        h("span", { class: "trash-text" }, h("span", { class: "trash-title change-path" }, f.path)),
        env.remote ? null : h("button", { class: "btn small", title: t("Show in Finder"), onclick: () => api.revealChange(f.path).catch((e) => toast(e.message, "error")) }, icon("folder")))),
      data.more ? h("p", { class: "muted small picker-tip" }, t2(data.more, "…and {n} more file", "…and {n} more files")) : null,
      h("p", { class: "muted small picker-tip" }, t("To publish, commit and push these in GitHub Desktop. w·i·p cms never publishes on its own.")));
  }
  show();
  return { el, refresh: show };
}
