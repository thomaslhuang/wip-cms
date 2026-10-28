// Themes: colors, fonts and code colors for the whole of wip cms.
//
// A theme is a handful of colors (the rest are mixed from them in styles.css), fonts, a
// writing size, and which code colors to use. Light themes are used in light mode, dark
// themes in dark mode; "Match my Mac" switches between your chosen light and dark theme.
// Built-in themes can't be changed, but "Duplicate" makes an editable copy.
// Everything is kept in this browser (localStorage).
import { h, fill, icon, toast } from "./util.js";
import { t as tr, tl } from "./i18n.js";

// built-in themes have translated names; your own keep the name you gave them
const nameOf = (theme) => (BUILT_IN.some((b) => b.id === theme.id) ? tr(theme.name) : theme.name);

// the fonts offered, in this order (plus "Other font…" for anything else)
//   google: load it from Google Fonts · weights: the ones loaded · italic: also load italics
//   weight: what the writing uses with this font unless the theme says otherwise
const FONTS = {
  system: { label: "System", family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' },
  garamond: { label: "EB Garamond", google: "EB Garamond", weights: [400, 500, 600, 700], italic: true, family: '"EB Garamond", Garamond, "Iowan Old Style", Georgia, serif' },
  mono: { label: "SF Mono", family: 'ui-monospace, "SF Mono", Menlo, monospace' },
  menlo: { label: "Menlo", family: 'Menlo, ui-monospace, monospace' },
  zenMincho: { label: "Zen Old Mincho", google: "Zen Old Mincho", weights: [400, 500, 600, 700], weight: 500, family: '"Zen Old Mincho", ui-serif, "Hiragino Mincho ProN", serif' },
  zenGothic: { label: "Zen Kaku Gothic New", google: "Zen Kaku Gothic New", weights: [400, 500, 700], weight: 400, family: '"Zen Kaku Gothic New", -apple-system, "Hiragino Sans", sans-serif' },
};
const font = (key, d) => (typeof key === "object" && key ? key : FONTS[key] ? { preset: key } : { preset: d });
const familyOf = (f) => (f.preset ? FONTS[f.preset]?.family : `"${f.custom}", ${FONTS.system.family}`);

// the colors you can change, in the order shown
const COLORS = [
  ["window", "Writing background"], ["sidebar", "Sidebar"], ["list", "Post list"], ["panel", "Toolbar & inspector"],
  ["card", "Cards & menus"], ["text", "Text"], ["muted", "Secondary text"], ["accent", "Accent"],
];

const BUILT_IN = [
  { id: "light", name: "Light", kind: "light", code: "ayu-light", colors: { window: "#ffffff", sidebar: "#f0f0f3", list: "#ffffff", panel: "#f6f6f8", card: "#ffffff", text: "#1d1d1f", muted: "#636366", accent: "#0a66d8" } },
  { id: "paper", name: "Paper", kind: "light", code: "ayu-light", writing: "garamond", size: 18, colors: { window: "#fbf8f1", sidebar: "#f0eadd", list: "#f8f4eb", panel: "#f4efe4", card: "#fffdf8", text: "#2a2723", muted: "#6b6358", accent: "#a94f27" } },
  { id: "dark", name: "Dark", kind: "dark", code: "ayu-dark", colors: { window: "#1e1e1f", sidebar: "#29292b", list: "#232325", panel: "#262628", card: "#2f2f31", text: "#f2f2f7", muted: "#a1a1a6", accent: "#0a66d8" } },
];

// ---------- stored settings ----------

const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
export const mode = () => { try { return localStorage.getItem("wip-theme") || "system"; } catch { return "system"; } };
const customThemes = () => read("wip-themes", []);
const allThemes = () => [...BUILT_IN, ...customThemes()];
const themeById = (id, kind) => allThemes().find((t) => t.id === id) || BUILT_IN.find((t) => t.id === kind);
const darkNow = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
function activeTheme() {
  const m = mode();
  const dark = m === "dark" || (m === "system" && darkNow());
  return dark ? themeById(read("wip-theme-dark", "dark"), "dark") : themeById(read("wip-theme-light", "light"), "light");
}

// ---------- turning a theme into CSS variables ----------

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
function varsFor(t) {
  const v = {};
  for (const [k] of COLORS) v["--" + k] = t.colors[k];
  // white or near-black text on accent-colored buttons, whichever reads better
  v["--on-accent"] = luminance(t.colors.accent) > 0.4 ? "#111111" : "#ffffff";
  v["--font"] = familyOf(font(t.font, "system"));
  v["--font-writing"] = familyOf(font(t.writing, "system"));
  v["--mono"] = familyOf(font(t.mono, "mono"));
  v["--writing-size"] = (t.size || 16) + "px";
  v["--writing-leading"] = String(t.leading || 1.6);
  v["--writing-tracking"] = (t.tracking || 0) + "em";
  v["--writing-weight"] = String(writingWeight(t));
  v["--writing-word-spacing"] = (t.wordSpacing || 0) + "em";
  v["--ui-weight"] = String(t.uiWeight || 400);
  v["--ui-scale"] = String((t.uiScale || 100) / 100);
  return v;
}
// the writing's weight: the theme's choice, else the font's own (Zen Old Mincho reads best at medium)
const writingWeight = (t) => t.weight || FONTS[font(t.writing, "system").preset]?.weight || 400;
// Google Fonts to load: [family, weight] pairs, one request each, so a weight a font doesn't
// have can't stop the others from loading. Fonts typed in by name load their regular weight.
const googleFonts = (t) => {
  const out = new Map();
  for (const x of [t.font, t.writing, t.mono].filter(Boolean)) {
    const f = font(x);
    const p = f.preset && FONTS[f.preset];
    if (p?.google) for (const w of p.weights || [400]) out.set(p.google + ":" + w, [p.google, w, p.italic]);
    else if (f.custom && f.google) out.set(f.custom + ":400", [f.custom, 400, false]);
  }
  return [...out.values()];
};

export function applyTheme(t = activeTheme()) {
  const root = document.documentElement;
  root.dataset.theme = t.kind;
  root.dataset.code = t.code || (t.kind === "dark" ? "ayu-dark" : "ayu-light");
  for (const [k, val] of Object.entries(varsFor(t))) root.style.setProperty(k, val);
  // custom fonts from Google Fonts
  document.querySelectorAll("link[data-theme-font]").forEach((l) => l.remove());
  for (const [name, weight, italic] of googleFonts(t)) {
    const spec = italic ? `ital,wght@0,${weight};1,${weight}` : `wght@${weight}`;
    document.head.append(h("link", { rel: "stylesheet", "data-theme-font": "", href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:${spec}&display=swap` }));
  }
  // remembered so index.html can paint the right colors before anything loads
  write("wip-theme-boot", { light: bootFor(themeById(read("wip-theme-light", "light"), "light")), dark: bootFor(themeById(read("wip-theme-dark", "dark"), "dark")) });
}
const bootFor = (t) => ({ kind: t.kind, code: t.code, vars: varsFor(t) });

export function setMode(m) {
  try { localStorage.setItem("wip-theme", m); } catch { /* fine */ }
  applyTheme();
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (mode() === "system") applyTheme(); });

// ---------- the Customize window ----------
//
// Three tabs: Themes (light / dark, pick and duplicate themes), Colors and Typography (for the
// theme you're looking at). The window keeps one size whatever the tab, so nothing jumps.

const WEIGHTS = [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"]];

export function openAppearance() {
  let editing = activeTheme().id;
  let tab = "themes";
  const body = h("div", { class: "custom-body" });
  const tabs = h("div", { class: "segmented custom-tabs", role: "tablist" });
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); applyTheme(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog custom-dialog", role: "dialog", "aria-label": tl("Customize") },
      h("div", { class: "custom-head" },
        h("span", { class: "custom-title" }, tl("Customize")),
        tabs,
        h("button", { class: "btn primary", onclick: close }, tr("Done"))),
      body));
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);

  const saveCustom = (t) => { write("wip-themes", customThemes().map((c) => (c.id === t.id ? t : c))); applyTheme(t); };

  // ----- small building blocks, in the style of the Mac's System Settings -----
  const group = (title, ...rows) => h("section", { class: "set-section" }, title ? h("h3", { class: "set-title" }, tl(title)) : null, h("div", { class: "set-group" }, rows));
  const row = (label, ...controls) => h("div", { class: "set-row" }, h("span", { class: "set-label" }, label), h("div", { class: "set-control" }, controls));
  const select = (options, value, onchange, label) => h("select", { class: "set-select", "aria-label": label, onchange: (e) => onchange(e.target.value) },
    options.map(([v, l]) => h("option", { value: v, selected: String(v) === String(value) }, l)));

  function draw() {
    fill(tabs, [["themes", "Themes"], ["colors", "Colors"], ["type", "Typography"]].map(([k, l]) =>
      h("button", { role: "tab", class: tab === k ? "on" : "", "aria-selected": String(tab === k), onclick: () => { tab = k; draw(); } }, tl(l))));
    const themes = allThemes();
    const current = themes.find((t) => t.id === editing) || themes[0];
    const builtIn = BUILT_IN.some((t) => t.id === current.id);
    const scroll = body.scrollTop;
    const note = builtIn ? lockedNote(current) : h("p", { class: "set-editing" }, tr("Editing “{name}”", { name: nameOf(current) }));
    // Typography: the preview first (it stays at the top), then the note, then the settings
    fill(body, tab === "themes" ? themesTab(themes, current, builtIn)
      : h("div", { class: builtIn ? "locked" : "" }, tab === "colors" ? [note, colorsTab(current)] : [typePreview(), note, typeTab(current)]));
    body.scrollTop = scroll;
  }

  function duplicate(current) {
    const copy = JSON.parse(JSON.stringify(current));
    copy.id = "custom-" + Date.now().toString(36);
    copy.name = nameOf(current) + " " + tr("copy");
    write("wip-themes", [...customThemes(), copy]);
    write(copy.kind === "dark" ? "wip-theme-dark" : "wip-theme-light", copy.id);
    editing = copy.id;
    applyTheme(copy);
    draw();
  }
  const lockedNote = (current) => h("div", { class: "set-note" },
    h("span", {}, tr("Built-in themes can't be changed. Duplicate one to make it your own.")),
    h("button", { class: "btn small", onclick: () => duplicate(current) }, icon("plus"), tl("Duplicate “{name}”", { name: nameOf(current) })));

  // ----- Themes -----
  function themesTab(themes, current, builtIn) {
    const lightId = read("wip-theme-light", "light"), darkId = read("wip-theme-dark", "dark");
    const pickFor = (kind) => select(themes.filter((t) => t.kind === kind).map((t) => [t.id, nameOf(t)]), kind === "dark" ? darkId : lightId,
      (v) => { write(kind === "dark" ? "wip-theme-dark" : "wip-theme-light", v); editing = v; applyTheme(); draw(); }, kind === "dark" ? tl("Dark theme") : tl("Light theme"));
    const card = (t) => h("button", { class: "theme-card" + (t.id === editing ? " on" : ""), onclick: () => { editing = t.id; applyTheme(t); draw(); }, "aria-pressed": String(t.id === editing) },
      h("span", { class: "theme-mini", style: { background: t.colors.window } },
        h("span", { class: "theme-mini-side", style: { background: t.colors.sidebar } }),
        h("span", { class: "theme-mini-lines" },
          h("span", { style: { background: t.colors.text } }), h("span", { style: { background: t.colors.muted, width: "60%" } }),
          h("span", { class: "theme-mini-dot", style: { background: t.colors.accent } }))),
      h("span", { class: "theme-name" }, nameOf(t)), h("span", { class: "theme-kind" }, t.kind === "dark" ? tr("Dark") : tr("Light")));
    const update = (fn) => { fn(current); saveCustom(current); };
    return [
      group(null,
        row(tl("Appearance"), h("div", { class: "segmented", role: "group", "aria-label": tl("Appearance") },
          [["system", tl("Match my Mac")], ["light", tr("Light")], ["dark", tr("Dark")]].map(([m, label]) =>
            h("button", { class: mode() === m ? "on" : "", "aria-pressed": String(mode() === m), onclick: () => { setMode(m); editing = activeTheme().id; draw(); } }, label)))),
        row(tl("Light theme"), pickFor("light")),
        row(tl("Dark theme"), pickFor("dark"))),
      h("section", { class: "set-section" }, h("h3", { class: "set-title" }, tl("Themes")),
        h("div", { class: "theme-cards" }, themes.map(card)),
        h("div", { class: "theme-actions" },
          h("button", { class: "btn small", onclick: () => duplicate(current) }, icon("plus"), tl("Duplicate")),
          h("button", { class: "btn small", onclick: () => exportTheme(current) }, icon("upload"), tl("Export")),
          h("button", { class: "btn small", onclick: () => importTheme((t) => { editing = t.id; applyTheme(t); draw(); }) }, icon("folder"), tl("Import…")),
          builtIn ? null : h("button", { class: "btn small", onclick: () => {
            write("wip-themes", customThemes().filter((t) => t.id !== current.id));
            for (const k of ["wip-theme-light", "wip-theme-dark"]) if (read(k) === current.id) write(k, k.endsWith("dark") ? "dark" : "light");
            editing = activeTheme().id; applyTheme(); draw();
          } }, icon("trash"), tl("Delete")))),
      builtIn ? null : group(null,
        row(tl("Name"), h("input", { class: "set-input", value: current.name, onchange: (e) => { update((x) => { x.name = e.target.value || tr("Untitled"); }); draw(); } })),
        row(tl("Used for"), h("div", { class: "segmented", role: "group", "aria-label": tr("Light or dark") },
          [["light", tl("Light mode")], ["dark", tl("Dark mode")]].map(([k, label]) => h("button", { class: current.kind === k ? "on" : "", onclick: () => {
            const was = current.kind === "dark" ? "wip-theme-dark" : "wip-theme-light";
            if (read(was) === current.id) write(was, current.kind);   // its old mode goes back to the built-in theme
            update((x) => { x.kind = k; });
            write(k === "dark" ? "wip-theme-dark" : "wip-theme-light", current.id);
            draw();
          } }, label))))),
    ];
  }

  // ----- Colors -----
  function colorsTab(t) {
    const update = (fn) => { fn(t); saveCustom(t); };
    const colorRow = ([key, label]) => {
      const hex = h("input", { class: "set-input hex", value: t.colors[key], "aria-label": tl(label) + " (hex)", onchange: (e) => {
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { update((x) => { x.colors[key] = e.target.value.toLowerCase(); }); picker.value = e.target.value; }
        else e.target.value = t.colors[key];
      } });
      const picker = h("input", { type: "color", class: "set-swatch", value: t.colors[key], "aria-label": tl(label), oninput: (e) => { hex.value = e.target.value; update((x) => { x.colors[key] = e.target.value; }); } });
      return row(tl(label), hex, picker);
    };
    return [
      group("Surfaces", ...COLORS.filter(([k]) => ["window", "sidebar", "list", "panel", "card"].includes(k)).map(colorRow)),
      group("Text and accent", ...COLORS.filter(([k]) => ["text", "muted", "accent"].includes(k)).map(colorRow)),
    ];
  }

  // ----- Typography -----
  // what the type looks like, drawn with the theme as you change it
  const typePreview = () => h("div", { class: "type-preview", "aria-hidden": "true" },
    h("div", { class: "type-preview-ui" }, h("span", {}, tl("Blog posts")), h("span", { class: "muted" }, "12 · 2026")),
    h("div", { class: "type-preview-title" }, "on mexico city"),
    h("p", { class: "type-preview-text" }, "I'm not really sure what I was expecting when this trip was planned, but it was ", h("em", {}, "wonderful"), ". 旅の記録と書体の見本。"),
    h("div", { class: "type-preview-code", html: codeSample() }));
  function typeTab(t) {
    const update = (fn) => { fn(t); saveCustom(t); };
    const fontPicker = (which, fallback) => {
      const f = font(t[which], fallback);
      const custom = h("input", { class: "set-input", placeholder: tr("Font name, e.g. Inter"), value: f.custom || "", hidden: !!f.preset,
        onchange: (e) => update((x) => { x[which] = { custom: e.target.value.trim(), google: !!google.checked }; }) });
      const google = h("input", { type: "checkbox", checked: !!f.google, onchange: () => update((x) => { x[which] = { custom: custom.value.trim(), google: google.checked }; }) });
      const googleRow = h("label", { class: "check-row", hidden: !!f.preset }, google, tr("From Google Fonts"));
      const sel = select([...Object.entries(FONTS).map(([k, v]) => [k, tl(v.label)]), ["custom", tl("Other font…")]], f.preset || "custom", (v) => {
        if (v === "custom") { custom.hidden = false; googleRow.hidden = false; custom.focus(); return; }
        custom.hidden = true; googleRow.hidden = true;
        update((x) => { x[which] = v; });
        draw();   // the weight menu follows the font
      }, tl("Font"));
      return h("div", { class: "font-pick" }, sel, custom, googleRow);
    };
    const weightPicker = (key, value) => select(WEIGHTS.map(([w, l]) => [w, tl(l)]), value, (v) => { update((x) => { x[key] = Number(v); }); }, tl("Weight"));
    const slider = (key, unit, min, max, step, dflt) => {
      const val = h("span", { class: "set-value" });
      const show = (v) => { val.textContent = Number(Number(v).toFixed(3)) + unit; };
      show(t[key] ?? dflt);
      return [h("input", { type: "range", class: "set-range", min, max, step, value: t[key] ?? dflt, oninput: (e) => { update((x) => { x[key] = Number(e.target.value); }); show(e.target.value); } }), val];
    };
    return [
      group("Interface",
        row(tl("Font"), fontPicker("font", "system")),
        row(tl("Weight"), weightPicker("uiWeight", t.uiWeight || 400)),
        row(tl("Size"), ...slider("uiScale", "%", 85, 130, 5, 100))),
      group("Writing",
        row(tl("Font"), fontPicker("writing", "system")),
        row(tl("Weight"), weightPicker("weight", writingWeight(t))),
        row(tl("Size"), ...slider("size", "px", 14, 22, 1, 16)),
        row(tl("Line spacing"), ...slider("leading", "", 1.2, 2.2, 0.05, 1.6)),
        row(tl("Letter spacing"), ...slider("tracking", "em", -0.03, 0.12, 0.005, 0)),
        row(tl("Word spacing"), ...slider("wordSpacing", "em", -0.1, 0.4, 0.01, 0))),
      group("Code",
        row(tl("Font"), fontPicker("mono", "mono")),
        row(tl("Colors"), select([["ayu-dark", "Ayu Dark"], ["ayu-light", "Ayu Light"]], t.code || "ayu-dark", (v) => update((x) => { x.code = v; }), tl("Code colors")))),
    ];
  }
  draw();
}

// ---------- sharing themes ----------
// Export saves the theme as a small file (to Downloads); Import adds one as a new theme.

export function exportTheme(theme) {
  const { id, ...rest } = theme;
  const data = { wipTheme: 1, ...rest, name: nameOf(theme) };
  const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })),
    download: `${nameOf(theme).replace(/[^\w\- ]+/g, "").trim() || "theme"}.wiptheme.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function importTheme(onDone) {
  const input = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const hex = /^#[0-9a-f]{6}$/i;
      if (!data || !data.colors || !COLORS.every(([k]) => hex.test(data.colors[k] || ""))) throw new Error();
      const theme = {
        ...Object.fromEntries(Object.entries(data).filter(([k]) => ["code", "font", "writing", "mono", "size", "leading", "tracking", "wordSpacing", "weight", "uiWeight", "uiScale"].includes(k))),
        id: "custom-" + Date.now().toString(36),
        name: String(data.name || file.name.replace(/\.wiptheme\.json$|\.json$/, "")).slice(0, 60),
        kind: data.kind === "dark" ? "dark" : "light",
        colors: Object.fromEntries(COLORS.map(([k]) => [k, data.colors[k].toLowerCase()])),
      };
      const taken = new Set([...BUILT_IN, ...customThemes()].map((x) => x.name));
      for (let n = 2, base = theme.name; taken.has(theme.name); n++) theme.name = `${base} ${n}`;
      write("wip-themes", [...customThemes(), theme]);
      write(theme.kind === "dark" ? "wip-theme-dark" : "wip-theme-light", theme.id);
      onDone?.(theme);
    } catch { toast(tr("That file isn't a wip cms theme."), "error"); }
  });
  document.body.append(input);
  input.click();
}

// a line of Markdown, colored the way Source view colors it
function codeSample() {
  const span = (c, s) => `<span class="syn-${c}">${s}</span>`;
  return span("markup", "## ") + span("markup", "notes") + "<br>" + span("fg", "some ") + span("special", "**") + span("fg", "bold") + span("special", "**") + span("fg", " and a ") +
    span("punct", "[") + span("entity", "link") + span("punct", "](") + span("string", "/blog/") + span("punct", ")") + span("fg", " ") + span("punct", "&lt;") + span("tag", "br") + span("punct", "&gt;");
}
