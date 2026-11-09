// The Pictures group in a post's inspector (the column beside the writing): the pictures in this
// post's own image folder, as small thumbnails. Drag one into the post (a blue line shows where it
// lands) or click it to add it after the selected block. Sizes are in the tooltip. It reloads a moment
// after the post changes, so new uploads show up.
import { h, fill } from "./util.js";
import { api } from "./api.js";
import { t } from "./i18n.js";

export const PICTURE_TYPE = "application/x-wip-picture";   // what a dragged thumbnail carries
const size = (n) => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";

// blocks: the post's block editor api (addPictures); returns { el, refresh }
export function picturePanel({ folder, blocks }) {
  const grid = h("div", { class: "pic-grid" });
  const el = h("div", { class: "group-wrap pic-panel" },
    h("div", { class: "group-label" }, t("Pictures")),
    h("div", { class: "group" }, grid,
      h("p", { class: "muted small pic-tip" }, t("Drag a picture into the post, or click one to add it."))));
  let seq = 0, timer = null;
  async function refresh() {
    const mine = ++seq;
    let list;
    try { list = await api.media(folder); } catch { return; }
    if (mine !== seq) return;
    const pics = list.images || [];
    el.hidden = !pics.length;
    fill(grid, pics.map((p) => h("button", {
      class: "pic-thumb", type: "button", draggable: true, title: `${p.name} · ${size(p.size)}`, "aria-label": t("Add {name} to the post", { name: p.name }),
      ondragstart: (e) => { e.dataTransfer.setData(PICTURE_TYPE, p.url); e.dataTransfer.setData("text/plain", p.url); e.dataTransfer.effectAllowed = "copy"; },
      onclick: () => blocks.addPictures([p.url]) },
      h("img", { src: p.url, alt: "", loading: "lazy", draggable: false }))));
  }
  refresh();
  return { el, refresh: () => { clearTimeout(timer); timer = setTimeout(refresh, 1500); } };
}
