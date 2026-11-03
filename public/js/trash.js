// The Trash page (Trash in the sidebar, under Site): what's in the site's .cms-trash folder,
// newest first, one group for each time something went to the Trash. Put back moves a post (with
// its image folder), a list item (into its old place in the list) or a file back where it was.
// Nothing is deleted from here: to empty the Trash, delete .cms-trash in the Finder.
import { h, fill, icon, toast } from "./util.js";
import { api } from "./api.js";
import { t, tl, fmtDate } from "./i18n.js";

const kindIcon = { post: "text", item: "list", file: "image" };

// onRestored({ file, kind }): after something is put back (to reload lists, open it…)
export function trashView({ onRestored = () => {} } = {}) {
  const body = h("div", { class: "trash-body" });
  const el = h("div", { class: "library trash-page" },
    h("div", { class: "picker-head" },
      h("div", { class: "picker-crumbs" }, h("b", {}, tl("Trash"))),
      h("button", { class: "btn small", onclick: () => api.revealTrash().catch((e) => toast(e.message, "error")) }, icon("folder"), t("Show in Finder"))),
    body);

  async function show() {
    let data;
    try { data = await api.trash(); } catch (e) { return fill(body, h("p", { class: "muted picker-empty" }, e.message)); }
    if (!data.trips.length) return fill(body, h("p", { class: "muted picker-empty" }, t("The Trash is empty.")));
    fill(body,
      data.trips.map((trip) => {
        const when = trip.when ? new Date(trip.when) : null;
        return h("section", { class: "trash-trip" },
          h("div", { class: "trash-when" }, when ? `${fmtDate(when, "long")} · ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : trip.stamp),
          trip.things.map((thing) => h("div", { class: "trash-row" },
            h("span", { class: "media-thumb" }, thing.kind === "file" && /\.(webp|jpe?g|png|gif|avif|svg)$/i.test(thing.title)
              ? h("img", { src: "/api/trash/file?" + new URLSearchParams({ id: thing.id }), alt: "", loading: "lazy" }) : icon(kindIcon[thing.kind] || "text")),
            h("span", { class: "trash-text" },
              h("span", { class: "trash-title" }, thing.title),
              h("span", { class: "muted small trash-was" }, thing.was + (thing.extra?.length ? " " + t("(with its pictures)") : ""))),
            h("button", { class: "btn small", onclick: (e) => putBack(thing, e.currentTarget) }, t("Put back")))));
      }),
      h("p", { class: "muted small picker-tip" }, t("Everything here is in the .cms-trash folder in your site. Put back returns it to where it was. To empty the Trash, delete that folder (or folders in it) in the Finder.")));
  }

  async function putBack(thing, btn) {
    btn.disabled = true;
    try {
      const r = await api.restoreFromTrash(thing.id);
      toast(t("Put back “{title}”", { title: thing.title }));
      await onRestored(r);
    } catch (e) { toast(e.message, "error"); }
    await show();
  }

  show();
  return { el, refresh: show };
}
