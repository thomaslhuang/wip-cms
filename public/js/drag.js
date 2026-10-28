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
