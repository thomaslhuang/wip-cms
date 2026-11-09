// Version history for the open post, page or list item (⋯ → Version history…): earlier versions from
// git, newest first. Open one to see what putting it back would change (red lines go away, green
// lines come back), then Put back. Read-only otherwise: nothing here commits or pushes.
import { h, fill, toast, confirmBox } from "./util.js";
import { api } from "./api.js";
import { t, fmtDate } from "./i18n.js";

const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${fmtDate(d, "long")} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`; };

// file: the open post; editor: so the current text is saved first and its version is known
// onRestored: called after a version is put back (the page reopens the post)
export function openHistory({ file, title, editor, onRestored }) {
  const body = h("div", { class: "history-body" }, h("p", { class: "muted" }, t("Looking…")));
  const close = () => overlay.remove();
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog history", role: "dialog", "aria-modal": "true", "aria-labelledby": "history-title" },
      h("p", { class: "dialog-title", id: "history-title" }, t("Version history: {title}", { title })),
      body,
      h("div", { class: "dialog-buttons" }, h("button", { class: "btn", onclick: close }, t("Close")))));
  document.body.append(overlay);

  async function load() {
    let data;
    try { await editor?.flush(); data = await api.history(file); } catch (e) { return fill(body, h("p", { class: "muted" }, e.message)); }
    if (!data.versions.length) return fill(body, h("p", { class: "muted" }, t(data.note || "No earlier versions yet. Versions appear here once this has been committed more than once.")));
    fill(body,
      h("p", { class: "muted small" }, t("Versions from your commits. Putting one back is a normal change: publish it in GitHub Desktop like any other. What it replaces is kept in .cms-trash.")),
      h("div", { class: "history-list", role: "list" }, data.versions.map((v) => row(v))));
  }

  function row(v) {
    const detail = h("div", { class: "history-detail", hidden: true });
    const toggle = h("button", { class: "history-head", "aria-expanded": "false", onclick: async () => {
      const open = detail.hidden;
      toggle.setAttribute("aria-expanded", String(open));
      detail.hidden = !open;
      if (open && !detail.dataset.loaded) { detail.dataset.loaded = "1"; await showDiff(v, detail); }
    } },
      h("span", { class: "history-when" }, when(v.when)),
      h("span", { class: "history-subject" }, v.subject || t("(no message)")),
      h("span", { class: "muted small history-who" }, `${v.author} · ${v.short}`));
    return h("div", { class: "history-row", role: "listitem" }, toggle, detail);
  }

  async function showDiff(v, el) {
    fill(el, h("p", { class: "muted small" }, t("Looking…")));
    let d;
    try { d = await api.historyDiff(file, v.commit); } catch (e) { return fill(el, h("p", { class: "muted small" }, e.message)); }
    const lines = d.tooBig ? [h("div", { class: "diff-line" }, t("Too long to compare here."))]
      : d.lines.map((l) => h("div", { class: "diff-line " + (l.op === "+" ? "add" : l.op === "-" ? "del" : l.op === "…" ? "gap" : "") },
        h("span", { class: "diff-mark", "aria-hidden": "true" }, l.op === " " ? "" : l.op),
        h("span", { class: "sr-only" }, l.op === "+" ? t("Comes back: ") : l.op === "-" ? t("Goes away: ") : ""),
        l.text));
    fill(el,
      h("div", { class: "diff", role: "group", "aria-label": t("What putting this version back changes") }, lines.length ? lines : h("p", { class: "muted small" }, t("No difference."))),
      h("button", { class: "btn small", onclick: () => putBack(v) }, t("Put this version back")));
  }

  async function putBack(v) {
    if (!(await confirmBox(t("Put back the version from {when}? Your current text is kept in .cms-trash, so nothing is lost.", { when: when(v.when) }), t("Put back")))) return;
    try {
      await editor?.flush();
      await api.restoreVersion(file, v.commit, editor?.version());
      close();
      toast(t("Put back. Your previous text is in .cms-trash/replaced-versions."));
      await onRestored();
    } catch (e) { toast(e.message, "error"); }
  }
  load();
}
