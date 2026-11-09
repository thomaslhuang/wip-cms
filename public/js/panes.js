// Draggable edges for the sidebar and the details column (the list and the line between writing and
// preview have their own handles, in app.js). Each width is remembered in this browser. Drag, or focus
// the edge and use ← →; double-click (or Home) puts it back. Phones don't use these: one column at a time.
import { h } from "./util.js";
import { t } from "./i18n.js";

const PANES = [
  { id: "sidebar", var: "--sidebar-w", def: 220, min: 180, max: 340, dir: 1, label: "Resize the sidebar" },
  { id: "inspector", var: "--inspector-w", def: 290, min: 240, max: 480, dir: -1, label: "Resize the details" },
];

export function wirePanes({ app, get, set }) {
  for (const p of PANES) {
    const pane = document.getElementById(p.id);
    let width = Math.min(p.max, Math.max(p.min, Number(get("w-" + p.id, p.def)) || p.def));
    const grip = h("div", { class: "pane-grip grip-" + p.id, role: "separator", "aria-orientation": "vertical", tabindex: "0", "aria-label": t(p.label),
      "aria-valuemin": String(p.min), "aria-valuemax": String(p.max) });
    const apply = (w, save) => {
      width = Math.min(p.max, Math.max(p.min, Math.round(w)));
      app.style.setProperty(p.var, width + "px");
      grip.setAttribute("aria-valuenow", String(width));
      if (save) set("w-" + p.id, width);
    };
    apply(width, false);
    // the sidebar's grip is inside it, on its right edge (so it's within a landmark); the details grip sits before its column
    if (p.dir === 1) {
      pane.append(grip);
      // (the sidebar is redrawn now and then, which clears it: put the edge back)
      new MutationObserver(() => { if (!grip.isConnected) pane.append(grip); }).observe(pane, { childList: true });
    } else pane.before(grip);
    grip.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startX = e.clientX, start = width;
      app.classList.add("resizing");
      grip.classList.add("dragging");
      const move = (ev) => apply(start + (ev.clientX - startX) * p.dir, false);
      const up = () => { grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
        app.classList.remove("resizing"); grip.classList.remove("dragging"); apply(width, true); window.dispatchEvent(new Event("resize")); };
      grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
    });
    grip.addEventListener("dblclick", () => { apply(p.def, true); window.dispatchEvent(new Event("resize")); });
    grip.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 48 : 16;
      if (e.key === "ArrowLeft") apply(width - step * p.dir, true);
      else if (e.key === "ArrowRight") apply(width + step * p.dir, true);
      else if (e.key === "Home") apply(p.def, true);
      else return;
      e.preventDefault();
      window.dispatchEvent(new Event("resize"));
    });
  }
}
