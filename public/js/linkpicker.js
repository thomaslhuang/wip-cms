// The link box (the "link" button in the writing toolbar): type a web address, or start typing the
// name of one of your own posts or pages and pick it. Replaces the browser's plain prompt, which
// can't search and blocks everything else while it's open.
//
//   pickLink({ rect, current, hasSelection, canRemove }) -> Promise of
//     { url, title }     a choice (title: the post's name, to use as the link text when nothing was selected)
//     { remove: true }   take the link off
//     null               cancelled
import { h, fill, icon } from "./util.js";
import { api } from "./api.js";
import { t } from "./i18n.js";

const LOOKS_LIKE_ADDRESS = /^(https?:\/\/|mailto:|tel:|\/|#)/i;
// "example.com/page" -> "https://example.com/page"; "/blog/x/" stays as it is
export function normalizeAddress(text) {
  const v = String(text || "").trim();
  if (!v) return "";
  if (LOOKS_LIKE_ADDRESS.test(v)) return v;
  if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) return "https://" + v;
  return "";
}

let uid = 0;
export function pickLink({ rect = null, current = "", hasSelection = true, canRemove = false } = {}) {
  return new Promise((resolve) => {
    const id = "linkpop-" + (++uid);
    let results = [], active = -1, timer = null, latest = 0;
    const input = h("input", { class: "linkpop-input", type: "text", value: current, spellcheck: false, autocomplete: "off", autocapitalize: "off",
      placeholder: t("Web address, or search your posts and pages"), role: "combobox", "aria-expanded": "false", "aria-controls": id + "-list",
      "aria-autocomplete": "list", "aria-label": t("Link to") });
    const list = h("div", { class: "linkpop-list", id: id + "-list", role: "listbox", "aria-label": t("Matching pages") });
    const note = h("p", { class: "linkpop-note muted small" });
    const finish = (value) => { pop.remove(); document.removeEventListener("pointerdown", outside, true); resolve(value); };
    const outside = (e) => { if (!pop.contains(e.target)) finish(null); };

    const options = () => {
      const typed = normalizeAddress(input.value);
      const rows = [];
      if (typed) rows.push({ url: typed, title: "", label: t("Link to {url}", { url: typed }), sub: "" });
      for (const r of results) rows.push({ url: r.url, title: r.title, label: r.title, sub: r.url });
      return rows;
    };
    function draw() {
      const rows = options();
      if (active >= rows.length) active = rows.length - 1;
      input.setAttribute("aria-expanded", String(rows.length > 0));
      if (active >= 0) input.setAttribute("aria-activedescendant", `${id}-o${active}`); else input.removeAttribute("aria-activedescendant");
      fill(list, rows.map((r, i) => h("div", { class: "linkpop-option" + (i === active ? " on" : ""), id: `${id}-o${i}`, role: "option", "aria-selected": String(i === active),
        onpointerdown: (e) => { e.preventDefault(); finish({ url: r.url, title: r.title }); } },
        r.sub ? icon("text") : icon("external"),
        h("span", { class: "linkpop-text" }, h("span", {}, r.label), r.sub ? h("span", { class: "muted small" }, r.sub) : null))));
      note.textContent = rows.length || input.value.trim().length >= 2 ? "" : t("Type to find one of your pages, or paste an address.");
    }
    async function search() {
      const q = input.value.trim();
      const mine = ++latest;
      if (q.length < 2 || LOOKS_LIKE_ADDRESS.test(q)) { results = []; return draw(); }
      try {
        const data = await api.search(q);
        if (mine !== latest) return;
        results = data.results.filter((r) => r.url).slice(0, 7);
      } catch { results = []; }
      if (active < 0 && results.length && !normalizeAddress(q)) active = 0;
      draw();
    }
    input.addEventListener("input", () => { active = -1; clearTimeout(timer); timer = setTimeout(search, 150); draw(); });
    input.addEventListener("keydown", (e) => {
      const rows = options();
      if (e.key === "ArrowDown") { e.preventDefault(); active = rows.length ? (active + 1) % rows.length : -1; draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = rows.length ? (active <= 0 ? rows.length - 1 : active - 1) : -1; draw(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const pick = rows[active] || rows[0];
        if (pick) finish({ url: pick.url, title: pick.title });
      } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); }
      else if (e.key === "Tab") { /* normal: moves on to the buttons */ }
    });

    const pop = h("div", { class: "linkpop", role: "dialog", "aria-label": t("Link") },
      h("label", { class: "linkpop-field" }, icon("external"), input),
      list, note,
      h("div", { class: "linkpop-actions" },
        canRemove ? h("button", { class: "btn small", onclick: () => finish({ remove: true }) }, t("Remove link")) : h("span"),
        h("button", { class: "btn small", onclick: () => finish(null) }, t("Cancel"))));
    pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); finish(null); } });
    document.body.append(pop);

    // beside the text it's for (or the middle of the screen when that isn't known); inside the window
    const w = Math.min(380, window.innerWidth - 16);
    pop.style.width = w + "px";
    if (rect && rect.width + rect.height > 0 && window.innerWidth > 700) {
      const m = pop.getBoundingClientRect();
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
      const below = rect.bottom + 8 + m.height < window.innerHeight;
      pop.style.left = left + "px";
      pop.style.top = (below ? rect.bottom + 8 : Math.max(8, rect.top - m.height - 8)) + "px";
    } else pop.classList.add("centered");
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    draw();
    input.focus();
    input.select();
    if (current) search();
  });
}
