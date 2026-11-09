// Search (top of the sidebar): looks through the titles and text of every section at once.
// Click a result to open it.
import { h, fill, icon, pageTitle } from "./util.js";
import { api } from "./api.js";
import { t, tl } from "./i18n.js";

export function searchView({ onOpen }) {
  const body = h("div", { class: "trash-body" });
  let timer = null, latest = 0;
  const input = h("input", { class: "search-input", type: "search", placeholder: t("Search everything"), "aria-label": t("Search everything"), autocomplete: "off",
    oninput: () => { clearTimeout(timer); timer = setTimeout(run, 180); } });
  const el = h("div", { class: "library trash-page" },
    pageTitle(tl("Search")),
    h("div", { class: "picker-head" }, h("label", { class: "search", style: "flex:1" }, icon("search"), input)),
    body);

  async function run() {
    const q = input.value.trim();
    const mine = ++latest;
    if (q.length < 2) return fill(body, h("p", { class: "muted picker-empty" }, t("Type to search the titles and text of everything on the site.")));
    let data;
    try { data = await api.search(q); } catch (e) { return fill(body, h("p", { class: "muted picker-empty" }, e.message)); }
    if (mine !== latest) return;   // a newer search is already on its way
    if (!data.results.length) return fill(body, h("p", { class: "muted picker-empty" }, t("Nothing found.")));
    fill(body, data.results.map((r) => h("button", { class: "trash-row search-row", onclick: () => onOpen(r) },
      h("span", { class: "trash-text" },
        h("span", { class: "trash-title" }, r.title),
        h("span", { class: "muted small trash-was" }, tl(r.sectionLabel) + (r.snippet ? " · " + r.snippet : ""))))),
      data.total > data.results.length ? h("p", { class: "muted small picker-tip" }, t("Showing the first {n}. Add a word to narrow it down.", { n: data.results.length })) : null);
  }
  run();
  setTimeout(() => input.focus(), 0);
  return { el };
}
