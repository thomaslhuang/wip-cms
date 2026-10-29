// Shared pieces for dragging things around (pictures in a carousel, blocks in a post):
//   ghost(...)        a small copy that follows the pointer, so you can see what you're moving
//   autoScroll(...)   scrolls a strip or the page when you drag near its edge
import { h } from "./util.js";

// content: what the ghost shows (an element); width: its size in px
export function ghost(content, width, e, offset = { x: width / 2, y: 24 }) {
  const el = h("div", { class: "drag-ghost", style: { width: width + "px" } }, content);
  document.body.append(el);
  const place = (x, y) => { el.style.transform = `translate(${x - offset.x}px, ${y - offset.y}px) rotate(-2deg)`; };
  place(e.clientX, e.clientY);
  return { move: (ev) => place(ev.clientX, ev.clientY), remove: () => el.remove() };
}

// containers: elements that may scroll; each is scrolled sideways and/or up and down when
// the pointer is within `edge` px of its sides. onScroll runs after each step (to re-check
// where the dragged thing would land).
export function autoScroll(containers, onScroll, edge = 48) {
  let x = 0, y = 0, running = true;
  const tick = () => {
    if (!running) return;
    for (const c of containers) {
      if (!c) continue;
      const r = c.getBoundingClientRect();
      let dx = 0, dy = 0;
      if (c.scrollWidth > c.clientWidth + 2 && y >= r.top && y <= r.bottom) {
        if (x < r.left + edge) dx = -Math.ceil((r.left + edge - x) / 4);
        else if (x > r.right - edge) dx = Math.ceil((x - (r.right - edge)) / 4);
      }
      if (c.scrollHeight > c.clientHeight + 2) {
        if (y < r.top + edge) dy = -Math.ceil((r.top + edge - y) / 3);
        else if (y > r.bottom - edge) dy = Math.ceil((y - (r.bottom - edge)) / 3);
      }
      if (dx || dy) { c.scrollLeft += dx; c.scrollTop += dy; onScroll?.(); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { at: (ev) => { x = ev.clientX; y = ev.clientY; }, stop: () => { running = false; } };
}

// Drag to reorder the children of a container (tiles in a grid, rows in a list).
//   handle:  a selector inside each child to drag by (or none: the whole child)
//   onMove(from, to): called once when you let go, if the order changed
// The dragged item itself moves as you go (a copy follows the pointer). Pointing at another
// item moves it to that item's place: after it if it comes later, before it if earlier. The
// item just passed is ignored until the pointer leaves it, so nothing flips back and forth.
// A click without moving is still a click.
export function sortable(container, { handle = null, onMove }) {
  container.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    const grip = handle ? e.target.closest(handle) : e.target;
    const el = grip && [...container.children].find((c) => c.contains(grip));
    if (!el || (!handle && e.target.closest("input, textarea, select, button:not(.sort-item), [contenteditable]"))) return;
    const from = [...container.children].indexOf(el);
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false, copy = null, scroller = null, last = e, passed = null;
    const inside = (c, ev) => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; };
    const place = (ev) => {
      if (passed && !inside(passed, ev)) passed = null;
      const kids = [...container.children].filter((c) => !c.classList.contains("sort-fixed"));
      const over = kids.find((c) => c !== el && inside(c, ev));
      if (!over || over === passed) return;
      if (kids.indexOf(over) > kids.indexOf(el)) container.insertBefore(el, over.nextSibling); else container.insertBefore(el, over);
      passed = over;
    };
    const move = (ev) => {
      last = ev;
      if (!dragging) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        dragging = true;
        const r = el.getBoundingClientRect();
        const w = Math.min(r.width, 220);
        copy = ghost(el.cloneNode(true), w, ev, { x: w / 2, y: Math.min(r.height, 120) / 2 });
        el.classList.add("sort-placeholder");
        container.classList.add("sorting");
        scroller = autoScroll([container.closest(".docpane, .inspector, .list-scroll")], () => place(last));
      }
      ev.preventDefault();
      copy.move(ev); scroller.at(ev); place(ev);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragging) return;
      copy.remove(); scroller.stop();
      el.classList.remove("sort-placeholder");
      container.classList.remove("sorting");
      const eat = (c) => { c.preventDefault(); c.stopPropagation(); };
      window.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 100);
      const to = [...container.children].indexOf(el);
      if (to !== from) onMove(from, to);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
  container.addEventListener("dragstart", (e) => e.preventDefault());
}
