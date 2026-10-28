// The panel layout, InDesign-style.
//
// Every part of the editor is a panel (Navigator, Details, Content, Preview, Images).
// Panels live in "stacks" (a group of tabs). Stacks sit side by side or above each other
// in "splits", which can be nested. You can:
//   - drag a panel by its tab onto another panel: drop on an edge to dock beside / above /
//     below it, or in the middle to add it as a tab
//   - drag the thin lines between panels to resize
//   - minimise a group of panels with its – button (or double-click its tabs): it shrinks
//     to just its tabs, and clicking a tab brings it back
//   - close a panel with its ×, and bring it back from the Window menu
// The layout is remembered in this browser (localStorage).
//
// A layout is plain data, for example:
//   { type: "split", dir: "row", sizes: [0.2, 0.8], children: [
//       { type: "stack", panels: ["navigator"], active: 0 },
//       { type: "stack", panels: ["content", "details"], active: 0 } ] }
import { h, icon } from "./util.js";

const STORE = "wip-cms-layout-2"; // bump the number when the built-in layouts change a lot
const NARROW = 800; // below this width, all panels become tabs in one stack

export function createDock(host, panels, presets) {
  // panels: { id: { title, el } }
  let layout = load() || clone(presets[Object.keys(presets)[0]]);
  let dragging = null; // panel id being dragged
  const listeners = new Set();

  // ---------- layout helpers (all work on the plain data above) ----------

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(layout)); } catch { /* fine */ } }
  function load() {
    try {
      const l = JSON.parse(localStorage.getItem(STORE));
      return l && valid(l) ? l : null;
    } catch { return null; }
  }
  function valid(node) {
    if (!node) return false;
    if (node.type === "stack") return Array.isArray(node.panels) && node.panels.every((p) => panels[p]);
    return node.type === "split" && Array.isArray(node.children) && node.children.every(valid);
  }
  const allPanelsIn = (node) => node.type === "stack" ? node.panels : node.children.flatMap(allPanelsIn);
  const isShown = (id) => !!layout && allPanelsIn(layout).includes(id);

  // remove a panel; tidy up empty stacks and splits with one child
  function removePanel(node, id) {
    if (node.type === "stack") {
      const i = node.panels.indexOf(id);
      if (i >= 0) { node.panels.splice(i, 1); node.active = Math.min(node.active || 0, Math.max(0, node.panels.length - 1)); }
      return node.panels.length ? node : null;
    }
    const kept = [], sizes = [];
    node.children.forEach((c, i) => { const r = removePanel(c, id); if (r) { kept.push(r); sizes.push(node.sizes[i]); } });
    if (!kept.length) return null;
    if (kept.length === 1) return kept[0];
    const total = sizes.reduce((a, b) => a + b, 0);
    return { ...node, children: kept, sizes: sizes.map((s) => s / total) };
  }

  // put a panel next to (or into) a target stack
  function insertAt(node, target, id, zone) {
    if (node === target) {
      if (zone === "center") { node.panels.push(id); node.active = node.panels.length - 1; node.min = false; return node; }
      const dir = zone === "left" || zone === "right" ? "row" : "col";
      const fresh = { type: "stack", panels: [id], active: 0 };
      const before = zone === "left" || zone === "top";
      return { type: "split", dir, sizes: [0.5, 0.5], children: before ? [fresh, node] : [node, fresh] };
    }
    if (node.type !== "split") return node;
    const children = [], sizes = [];
    node.children.forEach((c, i) => {
      const r = insertAt(c, target, id, zone);
      // a split in the same direction merges into this one instead of nesting
      if (r !== c && r.type === "split" && r.dir === node.dir && c.type === "stack") {
        r.children.forEach((rc) => { children.push(rc); sizes.push(node.sizes[i] / 2); });
      } else { children.push(r); sizes.push(node.sizes[i]); }
    });
    return { ...node, children, sizes };
  }

  function movePanel(id, target, zone) {
    if (target.type === "stack" && target.panels.length === 1 && target.panels[0] === id) return; // onto itself
    const copy = clone(layout);
    // find the target in the copy by matching its panels list (stacks are unique by content)
    const key = JSON.stringify(target.panels);
    const find = (n) => n.type === "stack" ? (JSON.stringify(n.panels) === key ? n : null) : n.children.map(find).find(Boolean);
    let tree = removePanel(copy, id);
    const t = tree && find(tree);
    if (!tree) tree = { type: "stack", panels: [], active: 0 };
    if (!t) { // target was the panel's own stack and is now gone: just add it back to the side
      layout = tree.type === "split" && tree.dir === "row"
        ? { ...tree, children: [...tree.children, { type: "stack", panels: [id], active: 0 }], sizes: [...tree.sizes.map((s) => s * 0.75), 0.25] }
        : { type: "split", dir: "row", sizes: [0.75, 0.25], children: [tree, { type: "stack", panels: [id], active: 0 }] };
    } else layout = insertAt(tree, t, id, zone);
    commit();
  }

  function show(id) {
    if (isShown(id)) {
      // already showing: bring its tab to the front
      const focus = (n) => { if (n.type === "stack") { const i = n.panels.indexOf(id); if (i >= 0) { n.active = i; n.min = false; } } else n.children.forEach(focus); };
      focus(layout);
      return commit();
    }
    const fresh = { type: "stack", panels: [id], active: 0 };
    layout = !layout ? fresh
      : layout.type === "split" && layout.dir === "row"
        ? { ...layout, children: [...layout.children, fresh], sizes: [...layout.sizes.map((s) => s * 0.7), 0.3] }
        : { type: "split", dir: "row", sizes: [0.7, 0.3], children: [layout, fresh] };
    commit();
  }
  function hide(id) {
    layout = removePanel(clone(layout), id);
    commit();
  }
  function usePreset(name) { layout = clone(presets[name]); commit(); }
  function commit() { save(); render(); listeners.forEach((fn) => fn()); }

  // ---------- drawing ----------

  function render() {
    // keep the panel contents alive while the frames around them are rebuilt
    Object.values(panels).forEach((p) => p.el.remove());
    host.replaceChildren();
    if (!layout) {
      host.append(h("div", { class: "dock-empty muted" }, "All panels are closed. Open one from the Window menu."));
      return;
    }
    const narrow = host.clientWidth < NARROW;
    const node = narrow ? { type: "stack", panels: allPanelsIn(layout), active: 0, narrow: true } : layout;
    host.append(drawNode(node));
  }

  // a minimised stack keeps only its tabs, so it takes no share of the space
  const isMin = (n) => n.type === "stack" && n.min;

  function drawNode(node, dir) {
    if (node.type === "stack") return drawStack(node, dir);
    const el = h("div", { class: `dock-split dock-${node.dir}` });
    // shares add up to 1 among the panels that aren't minimised, so they fill the space
    const open = node.children.reduce((t, c, i) => t + (isMin(c) ? 0 : node.sizes[i]), 0) || 1;
    node.children.forEach((child, i) => {
      if (i > 0) el.append(splitter(node, i, el));
      const cell = h("div", { class: "dock-cell" + (isMin(child) ? " min" : ""), style: { flex: isMin(child) ? "0 0 auto" : `${node.sizes[i] / open} 1 0` } }, drawNode(child, node.dir));
      el.append(cell);
    });
    return el;
  }

  function setMin(node, min) { node.min = min; commit(); }

  function drawStack(node, dir) {
    const active = Math.min(node.active || 0, node.panels.length - 1);
    const min = !node.narrow && node.min;
    const tabs = h("div", { class: "dock-tabs", ondblclick: (e) => { if (!node.narrow && !e.target.closest("button")) setMin(node, !node.min); } }, node.panels.map((id, i) => {
      const tab = h("div", { class: "dock-tab" + (i === active && !min ? " on" : ""), draggable: !node.narrow,
        onclick: () => { node.active = i; if (min) return setMin(node, false); if (!node.narrow) save(); render(); },
        ondragstart: (e) => { dragging = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); host.classList.add("dock-dragging"); },
        ondragend: () => { dragging = null; host.classList.remove("dock-dragging"); host.querySelectorAll(".dock-drop").forEach((d) => d.remove()); } },
        h("span", { class: "dock-tab-title" }, panels[id].title),
        node.narrow ? null : h("button", { class: "dock-tab-close", title: "Close panel (reopen from Window)", onclick: (e) => { e.stopPropagation(); hide(id); } }, icon("x")));
      return tab;
    }));
    if (!node.narrow) {
      tabs.append(h("button", { class: "dock-min", title: min ? "Restore" : "Minimise", onclick: (e) => { e.stopPropagation(); setMin(node, !min); } },
        icon(min ? "expand" : "minus")));
    }
    const stack = h("div", { class: "dock-stack" + (min ? ` min min-${dir || "row"}` : "") }, tabs);
    if (!min) stack.append(h("div", { class: "dock-body" }, panels[node.panels[active]].el));
    if (!node.narrow) addDropZones(stack, node);
    return stack;
  }

  // the five drop zones shown while dragging a tab over a panel
  function addDropZones(stack, node) {
    let overlay = null;
    const zoneAt = (e) => {
      const r = stack.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (y < 0.12 + 0) return e.clientY - r.top < 34 ? "center" : "top"; // over the tabs: add as a tab
      const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
      const [edge, dist] = Object.entries(d).sort((a, b) => a[1] - b[1])[0];
      return dist < 0.25 ? edge : "center";
    };
    stack.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const zone = zoneAt(e);
      if (!overlay) { overlay = h("div", { class: "dock-drop" }); stack.append(overlay); }
      overlay.dataset.zone = zone;
    });
    stack.addEventListener("dragleave", (e) => { if (overlay && !stack.contains(e.relatedTarget)) { overlay.remove(); overlay = null; } });
    stack.addEventListener("drop", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const zone = zoneAt(e), id = dragging;
      dragging = null;
      overlay?.remove(); overlay = null;
      host.classList.remove("dock-dragging");
      movePanel(id, node, zone);
    });
  }

  // the line between two panels: drag to resize
  function splitter(node, i, splitEl) {
    const line = h("div", { class: "dock-splitter" });
    if (isMin(node.children[i - 1]) || isMin(node.children[i])) { line.classList.add("fixed"); return line; }
    line.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      line.setPointerCapture(e.pointerId);
      const cells = [...splitEl.children].filter((c) => c.classList.contains("dock-cell"));
      const a = cells[i - 1], b = cells[i];
      const horizontal = node.dir === "row";
      const start = horizontal ? e.clientX : e.clientY;
      const sa = node.sizes[i - 1], sb = node.sizes[i];
      // pixels the two neighbours share, so minimised panels elsewhere don't throw it off
      const total = ((horizontal ? a.offsetWidth + b.offsetWidth : a.offsetHeight + b.offsetHeight) / (sa + sb)) || 1;
      const move = (ev) => {
        const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / total;
        const min = 0.08;
        const na = Math.max(min, Math.min(sa + sb - min, sa + delta));
        node.sizes[i - 1] = na; node.sizes[i] = sa + sb - na;
        const open = node.children.reduce((t, c, k) => t + (isMin(c) ? 0 : node.sizes[k]), 0) || 1;
        a.style.flex = `${node.sizes[i - 1] / open} 1 0`; b.style.flex = `${node.sizes[i] / open} 1 0`;
      };
      const up = () => { line.removeEventListener("pointermove", move); line.removeEventListener("pointerup", up); save(); };
      line.addEventListener("pointermove", move);
      line.addEventListener("pointerup", up);
    });
    return line;
  }

  let lastNarrow = null;
  window.addEventListener("resize", () => {
    const narrow = host.clientWidth < NARROW;
    if (narrow !== lastNarrow) { lastNarrow = narrow; render(); }
  });

  render();
  lastNarrow = host.clientWidth < NARROW;
  return {
    show, hide, isShown, usePreset, render,
    focus: (id) => show(id),
    onChange: (fn) => listeners.add(fn),
    presets: Object.keys(presets),
  };
}
