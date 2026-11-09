// The keyboard shortcuts sheet: ? on the keyboard, or Keyboard shortcuts in the ⋯ menu and the quick open list.
import { h } from "./util.js";
import { t } from "./i18n.js";

const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const keys = (...k) => h("span", { class: "keys" }, k.map((x) => h("kbd", {}, x)));
const cmd = mac ? "⌘" : "Ctrl";
const alt = mac ? "⌥" : "Alt";
const shift = mac ? "⇧" : "Shift";

export function openShortcuts() {
  if (document.querySelector(".shortcuts")) return;
  const groups = [
    [t("Go"), [[t("Quick open"), [cmd, "K"]], [t("Write, Split, Preview"), [cmd, "\\"]], [t("New item in this section"), [alt, cmd, "N"]], [t("This list"), ["?"]]]],
    [t("Writing"), [[t("Save now"), [cmd, "S"]], [t("Bold"), [cmd, "B"]], [t("Italic"), [cmd, "I"]], [t("Insert a block"), ["/"], t("on an empty line")]]],
    [t("Blocks"), [[t("Undo a block change"), [cmd, "Z"]], [t("Redo"), [shift, cmd, "Z"]], [t("Close a menu or window"), ["Esc"]]]],
  ];
  const close = () => overlay.remove();
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog shortcuts", role: "dialog", "aria-modal": "true", "aria-label": t("Keyboard shortcuts") },
      h("h2", { class: "dialog-title" }, t("Keyboard shortcuts")),
      groups.map(([title, rows]) => h("section", {},
        h("h3", { class: "group-label" }, title),
        rows.map(([label, k, note]) => h("div", { class: "shortcut-row" }, h("span", {}, label, note ? h("span", { class: "muted small" }, " · " + note) : null), keys(...k))))),
      h("div", { class: "dialog-buttons" }, h("button", { class: "btn", onclick: close }, t("Done")))));
  document.body.append(overlay);
}
