// Quick open (⌘K): type to jump to a section or page, start something new, change the view, or find
// a post by its title or words in it. ↑ ↓ to choose, ↩ to go, Esc to close.
//
//   openPalette({ items, onClose })   items: [{ group, label, hint?, run }], shown when the box is empty or matching
//   Posts and pages matching the words come from the whole-site search (js/search.js uses the same).
import { h, fill, icon } from "./util.js";
import { api } from "./api.js";
import { t, tl } from "./i18n.js";

let open = false;
export const paletteIsOpen = () => open;

export function openPalette({ items = [], onOpenResult }) {
  if (open) return;
  open = true;
  let shown = [], active = 0, found = [], timer = null, latest = 0, previous = document.activeElement;
  const input = h("input", { class: "palette-input", type: "text", role: "combobox", "aria-expanded": "true", "aria-controls": "palette-list", "aria-autocomplete": "list",
    "aria-label": t("Go to, or search"), placeholder: t("Go to a page, start something new, or search"), autocomplete: "off", spellcheck: false });
  const list = h("div", { class: "palette-list", id: "palette-list", role: "listbox", "aria-label": t("Results") });
  const status = h("div", { class: "sr-only", role: "status" });
  const close = () => { open = false; overlay.remove(); document.removeEventListener("keydown", onKey, true); if (previous?.isConnected) previous.focus?.(); };

  const words = () => input.value.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (it) => { const hay = (it.group + " " + it.label + " " + (it.hint || "")).toLowerCase(); return words().every((w) => hay.includes(w)); };

  function compute() {
    const own = items.filter(matches).slice(0, 8);
    shown = [...own, ...found.map((r) => ({ group: tl(r.sectionLabel), label: r.title, hint: r.snippet === r.title ? "" : r.snippet, result: r, run: () => onOpenResult(r) }))];
    if (active >= shown.length) active = Math.max(0, shown.length - 1);
  }
  function draw() {
    compute();
    let lastGroup = null;
    const rows = [];
    shown.forEach((it, i) => {
      if (it.group !== lastGroup) { rows.push(h("div", { class: "palette-group", role: "presentation" }, it.group)); lastGroup = it.group; }
      rows.push(h("div", { class: "palette-row" + (i === active ? " on" : ""), id: "palette-o" + i, role: "option", "aria-selected": String(i === active),
        onpointermove: () => { if (active !== i) { active = i; mark(); } },
        onclick: () => choose(it) },
        h("span", { class: "palette-label" }, it.label),
        it.hint ? h("span", { class: "palette-hint muted small" }, it.hint) : null));
    });
    if (!shown.length) rows.push(h("p", { class: "palette-empty muted" }, input.value.trim().length >= 2 ? t("Nothing found.") : t("Nothing to show.")));
    fill(list, rows);
    mark();
    status.textContent = shown.length ? t("{n} results", { n: shown.length }) : t("No results");
  }
  function mark() {
    list.querySelectorAll(".palette-row").forEach((el, i) => { const on = i === active; el.classList.toggle("on", on); el.setAttribute("aria-selected", String(on)); if (on) el.scrollIntoView({ block: "nearest" }); });
    input.setAttribute("aria-activedescendant", shown.length ? "palette-o" + active : "");
  }
  function choose(it) { close(); it.run(); }
  async function search() {
    const q = input.value.trim();
    const mine = ++latest;
    if (q.length < 2) { found = []; return draw(); }
    try { const data = await api.search(q); if (mine === latest) found = data.results.slice(0, 8); } catch { found = []; }
    if (mine === latest) draw();
  }
  input.addEventListener("input", () => { active = 0; clearTimeout(timer); timer = setTimeout(search, 150); draw(); });

  // (captured, so a key meant for the box never reaches the page behind it)
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (shown.length) { active = (active + 1) % shown.length; mark(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (shown.length) { active = (active - 1 + shown.length) % shown.length; mark(); } }
    else if (e.key === "Enter" && shown[active]) { e.preventDefault(); choose(shown[active]); }
    else if (e.key === "Tab") { e.preventDefault(); input.focus(); }
  };
  document.addEventListener("keydown", onKey, true);

  const overlay = h("div", { class: "overlay palette-overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog palette", role: "dialog", "aria-modal": "true", "aria-label": t("Quick open") },
      h("label", { class: "palette-field" }, icon("search"), input), list, status,
      h("p", { class: "palette-keys muted small", "aria-hidden": "true" }, "↑ ↓  " + t("choose") + "  ·  ↩  " + t("open") + "  ·  esc  " + t("close"))));
  document.body.append(overlay);
  draw();
  input.focus();
}
