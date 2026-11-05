// Touch behavior for phones, so w·i·p cms feels like an iPhone app rather than a small desktop
// window:
//   haptic()         a light tick (Android vibrates; iPhone Safari 17.4+ ticks when a hidden switch is toggled)
//   actionSheet()    menus as a sheet from the bottom, swipe down to dismiss
//   edgeSwipe()      drag from the left edge to go back, the screen following your finger
//   listGestures()   swipe a row left for Trash, press and hold a row for a menu, pull the list down to refresh
//   sheetDrag()      the Details sheet: drag its top to move between half and full height, or down to close
//   trackKeyboard()  tells the CSS how tall the keyboard is (--kb), so floating bars rise above it
import { h, icon } from "./util.js";
import { t } from "./i18n.js";

const phone = () => window.matchMedia("(max-width: 760px)").matches;
const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
const scaleOf = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;

// ---------- haptics ----------
let tick = null;
export function haptic() {
  try {
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    if (!tick) {
      tick = h("label", { "aria-hidden": "true", style: { position: "fixed", left: "-100px", top: "-100px", opacity: "0", pointerEvents: "none" } },
        h("input", { type: "checkbox", tabindex: "-1" }));
      tick.firstChild.setAttribute("switch", "");
      document.body.append(tick);
    }
    tick.click();
  } catch { /* best effort */ }
}

// ---------- the keyboard ----------
export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const set = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty("--kb", (kb > 80 ? kb : 0) + "px");
    document.documentElement.classList.toggle("kb-open", kb > 80);
  };
  vv.addEventListener("resize", set);
  vv.addEventListener("scroll", set);
}

// ---------- action sheets ----------
// items: the same list popMenu takes: "-", { heading }, { label, checked, danger, run }
export function actionSheet(items, { title } = {}) {
  closeSheets();
  let closing = false;
  const born = Date.now();   // the finger that opened it (press and hold) can still be lifting: ignore that tap
  const sheet = h("div", { class: "sheet-menu", role: "menu" });
  const backdrop = h("div", { class: "sheet-backdrop", onclick: (e) => { if (e.target === backdrop && Date.now() - born > 450) close(); } }, sheet);
  const close = (after) => {
    if (closing) return;
    closing = true;
    backdrop.classList.add("closing");
    sheet.style.transition = `transform 260ms ${ease}`;
    sheet.style.transform = "translateY(105%)";
    setTimeout(() => { backdrop.remove(); after?.(); }, 240);
  };
  const group = h("div", { class: "sheet-group" });
  for (const it of items) {
    if (it === "-") group.append(h("div", { class: "sheet-sep" }));
    else if (it.heading) group.append(h("div", { class: "sheet-heading" }, it.heading));
    else group.append(h("button", { role: "menuitem", class: "sheet-row" + (it.danger ? " danger" : ""), onclick: () => { haptic(); close(() => it.run()); } },
      h("span", { class: "sheet-check" }, it.checked ? icon("check") : null), it.label));
  }
  sheet.append(...[h("div", { class: "sheet-grab" }), title ? h("div", { class: "sheet-title" }, title) : null, group,
    h("button", { class: "sheet-cancel", onclick: () => close() }, t("Cancel"))].filter(Boolean));
  document.body.append(backdrop);

  // swipe down to dismiss (when the list inside is at its top)
  let y0 = null, dy = 0, t0 = 0;
  sheet.addEventListener("touchstart", (e) => { if (group.scrollTop <= 0 && e.touches.length === 1) { y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); } }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { e.preventDefault(); sheet.style.transition = "none"; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: false });
  sheet.addEventListener("touchend", () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, Date.now() - t0);
    y0 = null;
    if (dy > 90 || v > 0.6) close();
    else if (dy > 0) { sheet.style.transition = `transform 380ms ${ease}`; sheet.style.transform = ""; }
  });
  return close;
}
export const closeSheets = () => document.querySelectorAll(".sheet-backdrop").forEach((e) => e.remove());

// ---------- drag from the left edge to go back ----------
// el: the app; pane(): "nav" | "list" | "main"; under(): the pane that's one step back; go(): do the going back
export function edgeSwipe(el, { pane, under, go }) {
  let s = null;
  const reset = () => {
    el.classList.remove("swiping", "settling");
    el.querySelectorAll(".swipe-over, .swipe-under").forEach((x) => x.classList.remove("swipe-over", "swipe-under"));
    el.style.removeProperty("--swipe");
    s = null;
  };
  document.addEventListener("touchstart", (e) => {
    if (!phone() || e.touches.length !== 1 || pane() === "nav" || el.classList.contains("swiping")) return;
    if (document.querySelector(".overlay, .sheet-backdrop, .popmenu")) return;
    const p = e.touches[0];
    if (p.clientX > 24) return;
    s = { x0: p.clientX, y0: p.clientY, active: false, last: p.clientX, t: Date.now(), vx: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!s) return;
    const p = e.touches[0], dx = p.clientX - s.x0, dy = p.clientY - s.y0;
    if (!s.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > dx) { s = null; return; }
      if (dx < 10) return;
      s.active = true;
      const over = el.querySelector(`.${pane() === "main" ? "main" : "list"}`);
      const below = el.querySelector(`.${under() === "list" ? "list" : "sidebar"}`);
      over?.classList.add("swipe-over"); below?.classList.add("swipe-under");
      el.classList.add("swiping");
    }
    e.preventDefault();
    s.vx = (p.clientX - s.last) / Math.max(1, Date.now() - s.t); s.last = p.clientX; s.t = Date.now();
    el.style.setProperty("--swipe", String(Math.min(1, Math.max(0, dx / window.innerWidth))));
  }, { passive: false });
  const end = () => {
    if (!s) return;
    if (!s.active) { s = null; return; }
    const p = Number(el.style.getPropertyValue("--swipe")) || 0;
    const commit = p > 0.33 || s.vx > 0.5;
    el.classList.add("settling");
    el.style.setProperty("--swipe", commit ? "1" : "0");
    if (!commit) { setTimeout(reset, 330); return; }
    haptic();
    setTimeout(() => {
      // the screen changes underneath, then the swipe's own layers go away in the same moment
      el.dataset.skip = "1";
      const done = () => { reset(); setTimeout(() => delete el.dataset.skip, 50); mo.disconnect(); };
      const mo = new MutationObserver(done);
      mo.observe(el, { attributes: true, attributeFilter: ["data-pane"] });
      setTimeout(() => { if (el.classList.contains("swiping")) done(); }, 1500);
      go();
    }, 300);
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
}

// ---------- the list: swipe, press and hold, pull to refresh ----------
// listEl: the list column; hooks: { rowOf(a), canSwipe(), trash(file), menu(file), refresh() }
export function listGestures(listEl, hooks) {
  let g = null, openRow = null, suppressUntil = 0;
  const FULL = () => Math.min(220, window.innerWidth * 0.55);
  const OPEN = 88;

  listEl.addEventListener("click", (e) => {
    if (Date.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); return; }
    // tapping a row that's swiped open closes it instead of opening the post
    if (openRow && e.target.closest("a[data-file]") === openRow.row) { e.preventDefault(); e.stopPropagation(); closeRow(); }
  }, true);

  function revealFor(row) {
    const host = row.parentElement;
    let r = host.querySelector(":scope > .swipe-del");
    if (!r) {
      r = h("button", { class: "swipe-del", "aria-label": t("Move to Trash"), onclick: () => { const f = row.dataset.file; closeRow(); hooks.trash(f); } }, icon("trash"), h("span", {}, t("Trash")));
      host.append(r);
    }
    r.style.top = row.offsetTop + "px"; r.style.height = row.offsetHeight + "px";
    return r;
  }
  function place(row, x, animate) {
    const r = revealFor(row);
    row.style.transition = animate ? `transform 380ms ${ease}` : "none";
    row.style.transform = x ? `translateX(${x}px)` : "";
    r.style.transition = animate ? `left 380ms ${ease}, width 380ms ${ease}` : "none";
    const w = Math.max(0, -x);
    r.style.left = row.offsetLeft + row.offsetWidth - w + "px"; r.style.width = (w ? w + 14 : 0) + "px";   // (to the screen edge)
    r.classList.toggle("armed", w >= FULL());
    return r;
  }
  function closeRow() {
    if (!openRow) return;
    const { row } = openRow; openRow = null;
    place(row, 0, true);
    setTimeout(() => { if (!openRow || openRow.row !== row) { row.style.transition = ""; row.parentElement?.querySelector(":scope > .swipe-del")?.remove(); } }, 400);
  }
  document.addEventListener("touchstart", (e) => { if (openRow && !e.target.closest(".swipe-del") && !e.target.closest("a[data-file]")) closeRow(); }, { passive: true });

  listEl.addEventListener("touchstart", (e) => {
    if (!phone() || e.touches.length !== 1) return;
    const p = e.touches[0];
    if (p.clientX <= 24) return;   // the left edge is for going back
    const row = e.target.closest("a[data-file]");
    g = { x0: p.clientX, y0: p.clientY, row, mode: null, pull: 0, timer: null, atTop: listEl.scrollTop <= 0, armed: false };
    if (openRow && row !== openRow.row) closeRow();
    if (row && !row.closest(".selecting")) {
      g.timer = setTimeout(() => {
        if (g && !g.mode) { g.mode = "press"; suppressUntil = Date.now() + 600; haptic(); hooks.menu(row.dataset.file); }
      }, 480);
    }
  }, { passive: true });

  listEl.addEventListener("touchmove", (e) => {
    if (!g) return;
    const p = e.touches[0], dx = p.clientX - g.x0, dy = p.clientY - g.y0;
    if (!g.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      clearTimeout(g.timer);
      if (g.row && hooks.canSwipe(g.row) && Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || (openRow && openRow.row === g.row))) { g.mode = "swipe"; g.base = openRow && openRow.row === g.row ? -OPEN : 0; }
      else if (g.atTop && dy > 0 && Math.abs(dy) > Math.abs(dx) && listEl.scrollTop <= 0) g.mode = "pull";
      else { g.mode = "none"; return; }
    }
    if (g.mode === "swipe") {
      e.preventDefault();
      const x = Math.min(0, Math.max(-window.innerWidth * 0.9, g.base + dx));
      place(g.row, x, false);
      const armed = -x >= FULL();
      if (armed !== g.armed) { g.armed = armed; haptic(); }
      g.x = x;
    } else if (g.mode === "pull") {
      e.preventDefault();
      g.pull = Math.min(110, dy * 0.5);
      pullTo(g.pull, false);
    }
  }, { passive: false });

  const body = () => listEl.querySelector(".list-body");
  const spinner = () => {
    let s = listEl.querySelector(".ptr");
    if (!s) { s = h("div", { class: "ptr" }, h("span", { class: "ptr-ring" })); listEl.append(s); }
    return s;
  };
  function pullTo(px, animate) {
    const b = body(), s = spinner();
    if (b) { b.style.transition = animate ? `transform 380ms ${ease}` : "none"; b.style.transform = px ? `translateY(${px}px)` : ""; }
    s.style.opacity = String(Math.min(1, px / 50));
    s.style.setProperty("--pull", String(Math.min(1, px / 64)));
    s.style.transform = `translateY(${Math.max(0, px - 40)}px) rotate(${px * 4}deg)`;
  }
  function end() {
    if (!g) return;
    clearTimeout(g.timer);
    const m = g.mode; const cur = g; g = null;
    if (m === "swipe") {
      const x = cur.x ?? 0;
      if (-x >= FULL()) { const f = cur.row.dataset.file; place(cur.row, 0, true); setTimeout(() => cur.row.parentElement?.querySelector(":scope > .swipe-del")?.remove(), 400); hooks.trash(f); }
      else if (-x >= 56) { openRow = { row: cur.row }; place(cur.row, -OPEN, true); }
      else { openRow = { row: cur.row }; closeRow(); }
      suppressUntil = Date.now() + 350;
    } else if (m === "pull") {
      if (cur.pull >= 60) {
        haptic();
        pullTo(52, true); spinner().classList.add("spinning");
        Promise.resolve(hooks.refresh()).catch(() => {}).finally(() => { spinner().classList.remove("spinning"); pullTo(0, true); setTimeout(() => spinner().remove(), 400); });
      } else { pullTo(0, true); setTimeout(() => spinner().remove(), 400); }
    }
  }
  listEl.addEventListener("touchend", end);
  listEl.addEventListener("touchcancel", end);
}

// ---------- the Details sheet: half height, full height, or away ----------
export function sheetDrag(sheet, { close }) {
  let s = null;
  const H = () => window.innerHeight;
  const full = () => Math.round(H() * 0.08), half = () => Math.round(H() * 0.5);
  sheet.addEventListener("touchstart", (e) => {
    if (!phone() || e.touches.length !== 1 || !e.target.closest(".sheet-head, .sheet-grab")) return;
    s = { y0: e.touches[0].clientY, top: sheet.getBoundingClientRect().top, last: e.touches[0].clientY, t: Date.now(), v: 0 };
    sheet.style.transition = "none";
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (!s) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    s.v = (y - s.last) / Math.max(1, Date.now() - s.t); s.last = y; s.t = Date.now();
    sheet.style.top = Math.max(full() - 24, s.top + (y - s.y0)) + "px";
  }, { passive: false });
  sheet.addEventListener("touchend", () => {
    if (!s) return;
    const top = sheet.getBoundingClientRect().top + s.v * 180;   // where it was heading
    s = null;
    sheet.style.transition = `top 420ms ${ease}`;
    if (top > H() * 0.8) {
      sheet.style.top = H() + "px";
      setTimeout(() => { close(); sheet.style.top = ""; sheet.style.transition = ""; }, 260);
    } else sheet.style.top = (top > H() * 0.3 ? half() : full()) + "px";
  });
}

// ---------- segmented controls: the selected part slides ----------
// Every .segmented gets a thumb under the pressed button. The controls are redrawn from scratch
// on each change, so where the thumb last was is remembered by the control's name, and the
// new thumb starts there and moves to its place.
const lastThumb = new Map();
function addThumb(seg) {
  if (seg.dataset.thumb) return;
  const on = seg.querySelector(":scope > button.on");
  if (!on || !seg.offsetWidth) return;
  seg.dataset.thumb = "1";
  const key = seg.getAttribute("aria-label") || seg.className;
  const thumb = h("span", { class: "seg-thumb", "aria-hidden": "true" });
  seg.prepend(thumb);
  const to = { x: on.offsetLeft, w: on.offsetWidth };
  const from = lastThumb.get(key) || to;
  thumb.style.transition = "none";
  thumb.style.width = from.w + "px"; thumb.style.transform = `translateX(${from.x}px)`;
  seg.classList.add("has-thumb");
  thumb.getBoundingClientRect();   // (so the starting place counts before it moves)
  thumb.style.transition = "";
  thumb.style.width = to.w + "px"; thumb.style.transform = `translateX(${to.x}px)`;
  lastThumb.set(key, to);
}
export function slidingSegments() {
  const scan = () => document.querySelectorAll(".segmented:not([data-thumb])").forEach(addThumb);
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } })
    .observe(document.body, { childList: true, subtree: true });
  // a control that changes in place (rather than being redrawn) slides its thumb too
  document.addEventListener("click", (e) => {
    const seg = e.target.closest?.(".segmented.has-thumb");
    if (!seg) return;
    requestAnimationFrame(() => {
      if (!seg.isConnected) return;
      const on = seg.querySelector(":scope > button.on"), thumb = seg.querySelector(":scope > .seg-thumb");
      if (on && thumb) { thumb.style.width = on.offsetWidth + "px"; thumb.style.transform = `translateX(${on.offsetLeft}px)`; lastThumb.set(seg.getAttribute("aria-label") || seg.className, { x: on.offsetLeft, w: on.offsetWidth }); }
    });
  });
  scan();
}
