// Small helpers used everywhere in the editor.
import { t as tr } from "./i18n.js";

// h("div", { class: "x", onclick: fn }, "text", childEl, [more, children])
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value") el.value = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  // sliders: how far along they are, for the filled part of the track (styles.css)
  if (tag === "input" && el.type === "range") {
    const fill = () => el.style.setProperty("--p", ((Number(el.value) - Number(el.min || 0)) / ((Number(el.max || 100) - Number(el.min || 0)) || 1)) * 100 + "%");
    fill();
    el.addEventListener("input", fill);
  }
  return el;
}

// put children into an element, skipping empty ones (null/false/undefined)
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

// inline icons (from the Lucide set, like Pages CMS)
const ICONS = {
  chevron: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  arrows: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  collapse: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
  expand: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  linebreak: '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  menu: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  inspector: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  insert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  images: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  text: '<path d="M4 6h16M4 11h16M4 16h10M4 20h7"/>',
  sort: '<path d="M3 6h13M3 12h9M3 18h5"/><path d="m17 15 3 3 3-3"/><path d="M20 18V6"/>',
  rows: '<rect x="3" y="4" width="6" height="6" rx="1.5"/><rect x="3" y="14" width="6" height="6" rx="1.5"/><path d="M13 6h8M13 9h5M13 16h8M13 19h5"/>',
  // four small squares with room between them, in a lighter line (a grid of thin boxes reads heavier than other icons)
  grid: '<g stroke-width="1.45"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></g>',
  // Titles only: a capital T (the lines icon looked too much like Sort)
  titles: '<path d="M6 5h12"/><path d="M12 5v14"/>',
  carousel: '<rect x="6" y="5" width="12" height="14" rx="2"/><path d="M2 7v10M22 7v10"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  house: '<path d="M4 11 12 4l8 7v9H4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><path d="M12 7.5h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tick: '<path d="M6.5 12.5l3.75 3.75L17.5 8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevrons: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15 4v16"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  // the list's Select: a list with checkmarks (a bare check reads as "done")
  select: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = "icon " + cls;
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return span;
}

// muted color per block type (same as the Pages CMS script)
const TYPE_COLORS = {
  text: "#8c9bb8", image: "#8fae8b", "multi-upload": "#c4a46b", photos: "#c4a46b",
  carousel: "#b48fb3", collage: "#c98f7a", html: "#9b9b9b",
};
const EXTRA = ["#a3a07a", "#8fa3c4", "#c49a9a", "#9ab89a"];
export function colorFor(label) {
  label = String(label || "").toLowerCase();
  if (TYPE_COLORS[label]) return TYPE_COLORS[label];
  let n = 0;
  for (const ch of label) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA[n % EXTRA.length];
}

// first N words of some markdown, without the markdown
export function firstWords(text, n = 6) {
  const words = String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")          // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")        // links -> their text
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#>`\\]/g, "")
    .split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

// short notice in the corner
export function toast(message, kind = "") {
  const t = h("div", { class: "toast " + kind }, message);
  document.body.append(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
}

// confirm box in the page's style; resolves true/false
export function confirmBox(message, yes = tr("Remove")) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(false); } },
      h("div", { class: "dialog" },
        h("p", {}, message),
        h("div", { class: "dialog-buttons" },
          h("button", { class: "btn", onclick: () => close(false) }, tr("Cancel")),
          h("button", { class: "btn danger", onclick: () => close(true) }, yes))));
    document.body.append(overlay);
  });
}

// grow a textarea to fit its text
export function autosize(t) {
  const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
  t.addEventListener("input", fit);
  requestAnimationFrame(fit);
  return t;
}

export const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);
