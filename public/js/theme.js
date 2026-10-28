// Themes: colors, fonts and code colors for the whole of wip cms.
//
// A theme is a handful of colors (the rest are mixed from them in styles.css), fonts, a
// writing size, and which code colors to use. Light themes are used in light mode, dark
// themes in dark mode; "Match my Mac" switches between your chosen light and dark theme.
// Built-in themes can't be changed, but "Duplicate" makes an editable copy.
// Everything is kept in this browser (localStorage).
import { h, fill, icon } from "./util.js";
import { t as tr } from "./i18n.js";

// built-in themes have translated names; your own keep the name you gave them
const nameOf = (theme) => (BUILT_IN.some((b) => b.id === theme.id) ? tr(theme.name) : theme.name);

const FONTS = {
  system: { label: "System (San Francisco)", family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' },
  serif: { label: "New York (serif)", family: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif' },
  iowan: { label: "Iowan Old Style", family: '"Iowan Old Style", Palatino, Georgia, serif' },
  helvetica: { label: "Helvetica Neue", family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  rounded: { label: "SF Rounded", family: 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif' },
  mono: { label: "SF Mono", family: 'ui-monospace, "SF Mono", Menlo, monospace' },
  menlo: { label: "Menlo", family: 'Menlo, ui-monospace, monospace' },
  // from Google Fonts (loaded when a theme uses them)
  zenMincho: { label: "Zen Old Mincho", google: "Zen Old Mincho:wght@400;500;700", family: '"Zen Old Mincho", ui-serif, "Hiragino Mincho ProN", serif' },
  zenGothic: { label: "Zen Kaku Gothic New", google: "Zen Kaku Gothic New:wght@400;500;700", family: '"Zen Kaku Gothic New", -apple-system, "Hiragino Sans", sans-serif' },
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
  { id: "dark", name: "Dark", kind: "dark", code: "ayu-dark", colors: { window: "#1e1e1f", sidebar: "#29292b", list: "#232325", panel: "#262628", card: "#2f2f31", text: "#f2f2f7", muted: "#a1a1a6", accent: "#0a66d8" } },
  { id: "paper", name: "Paper", kind: "light", code: "ayu-light", writing: "iowan", colors: { window: "#fbf8f1", sidebar: "#f0eadd", list: "#f8f4eb", panel: "#f4efe4", card: "#fffdf8", text: "#2a2723", muted: "#6b6358", accent: "#a94f27" } },
  { id: "ayu", name: "Ayu", kind: "dark", code: "ayu-dark", mono: "menlo", colors: { window: "#0b0e14", sidebar: "#0d1017", list: "#0f131a", panel: "#0f131a", card: "#151a23", text: "#bfbdb6", muted: "#8a8f98", accent: "#e6b450" } },
  { id: "ink", name: "Ink", kind: "dark", code: "ayu-dark", writing: "serif", colors: { window: "#131923", sidebar: "#18202c", list: "#161d28", panel: "#19212d", card: "#1f2836", text: "#e6ebf2", muted: "#9aa6b6", accent: "#4c8dff" } },
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
  return v;
}
// "Zen Old Mincho:wght@400;700" -> Zen+Old+Mincho:wght@400;700. Fonts typed in by name ask
// for the regular weight only, which every Google font has (bold is then drawn by the browser).
const googleSpec = (name) => { const [fam, axes] = name.split(":"); return encodeURIComponent(fam).replace(/%20/g, "+") + (axes ? ":" + axes : ""); };
const googleFonts = (t) => [...new Set([t.font, t.writing, t.mono].filter(Boolean).map((x) => {
  const f = font(x);
  return f.preset ? FONTS[f.preset]?.google : f.google ? f.custom : null;
}).filter(Boolean))];

export function applyTheme(t = activeTheme()) {
  const root = document.documentElement;
  root.dataset.theme = t.kind;
  root.dataset.code = t.code || (t.kind === "dark" ? "ayu-dark" : "ayu-light");
  for (const [k, val] of Object.entries(varsFor(t))) root.style.setProperty(k, val);
  // custom fonts from Google Fonts
  document.querySelectorAll("link[data-theme-font]").forEach((l) => l.remove());
  for (const name of googleFonts(t)) {
    document.head.append(h("link", { rel: "stylesheet", "data-theme-font": "", href: `https://fonts.googleapis.com/css2?family=${googleSpec(name)}&display=swap` }));
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

// ---------- the Appearance window ----------

export function openAppearance() {
  let editing = activeTheme().id;
  const body = h("div", { class: "appearance" });
  const close = () => { overlay.remove(); applyTheme(); };
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog appearance-dialog", role: "dialog", "aria-label": tr("Appearance") },
      h("div", { class: "appearance-head" }, h("p", { class: "dialog-title" }, tr("Appearance")), h("button", { class: "btn primary", onclick: close }, tr("Done"))),
      body));
  document.body.append(overlay);
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);

  const saveCustom = (t) => { write("wip-themes", customThemes().map((c) => (c.id === t.id ? t : c))); applyTheme(t); };

  function draw() {
    const themes = allThemes();
    const current = themes.find((t) => t.id === editing) || themes[0];
    const lightId = read("wip-theme-light", "light"), darkId = read("wip-theme-dark", "dark");
    const pickFor = (kind) => h("select", { class: "field-input", "aria-label": kind === "dark" ? tr("Dark theme") : tr("Light theme"),
      onchange: (e) => { write(kind === "dark" ? "wip-theme-dark" : "wip-theme-light", e.target.value); editing = e.target.value; applyTheme(); draw(); } },
      themes.filter((t) => t.kind === kind).map((t) => h("option", { value: t.id, selected: t.id === (kind === "dark" ? darkId : lightId) }, nameOf(t))));

    const swatch = (t) => h("button", { class: "theme-card" + (t.id === editing ? " on" : ""), onclick: () => { editing = t.id; applyTheme(t); draw(); }, "aria-pressed": String(t.id === editing) },
      h("span", { class: "theme-mini", style: { background: t.colors.window } },
        h("span", { class: "theme-mini-side", style: { background: t.colors.sidebar } }),
        h("span", { class: "theme-mini-lines" },
          h("span", { style: { background: t.colors.text } }), h("span", { style: { background: t.colors.muted, width: "60%" } }),
          h("span", { class: "theme-mini-dot", style: { background: t.colors.accent } }))),
      h("span", { class: "theme-name" }, nameOf(t)), h("span", { class: "theme-kind" }, t.kind === "dark" ? tr("Dark") : tr("Light")));

    const builtIn = BUILT_IN.some((t) => t.id === current.id);
    const duplicate = () => {
      const copy = JSON.parse(JSON.stringify(current));
      copy.id = "custom-" + Date.now().toString(36);
      copy.name = nameOf(current) + " copy";
      write("wip-themes", [...customThemes(), copy]);
      write(copy.kind === "dark" ? "wip-theme-dark" : "wip-theme-light", copy.id);
      editing = copy.id;
      applyTheme(copy);
      draw();
    };

    fill(body,
      h("div", { class: "appearance-row" },
        h("span", { class: "appearance-label" }, tr("Mode")),
        h("div", { class: "segmented", role: "group", "aria-label": tr("Mode") },
          [["system", tr("Match my Mac")], ["light", tr("Light")], ["dark", tr("Dark")]].map(([m, label]) =>
            h("button", { class: mode() === m ? "on" : "", "aria-pressed": String(mode() === m), onclick: () => { setMode(m); editing = activeTheme().id; draw(); } }, label)))),
      h("div", { class: "appearance-row two" },
        h("label", {}, h("span", { class: "appearance-label" }, tr("Light theme")), pickFor("light")),
        h("label", {}, h("span", { class: "appearance-label" }, tr("Dark theme")), pickFor("dark"))),
      h("div", { class: "theme-cards" }, themes.map(swatch)),
      h("div", { class: "theme-actions" },
        h("button", { class: "btn small", onclick: duplicate }, icon("plus"), builtIn ? tr("Duplicate “{name}” to customize", { name: nameOf(current) }) : tr("Duplicate")),
        builtIn ? null : h("button", { class: "btn small", onclick: () => {
          write("wip-themes", customThemes().filter((t) => t.id !== current.id));
          for (const k of ["wip-theme-light", "wip-theme-dark"]) if (read(k) === current.id) write(k, k.endsWith("dark") ? "dark" : "light");
          editing = activeTheme().id; applyTheme(); draw();
        } }, icon("trash"), tr("Delete theme"))),
      builtIn ? h("p", { class: "muted small" }, tr("Built-in themes can't be changed. Duplicate one to make your own: colors, fonts and code colors.")) : editor(current));
  }

  function editor(t) {
    const update = (fn) => { fn(t); saveCustom(t); };
    const colorRow = ([key, label]) => {
      const text = h("input", { class: "field-input hex", value: t.colors[key], "aria-label": tr(label) + " (hex)", onchange: (e) => {
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { update((x) => { x.colors[key] = e.target.value.toLowerCase(); }); picker.value = e.target.value; }
        else e.target.value = t.colors[key];
      } });
      const picker = h("input", { type: "color", value: t.colors[key], "aria-label": tr(label), oninput: (e) => { text.value = e.target.value; update((x) => { x.colors[key] = e.target.value; }); } });
      return h("label", { class: "color-row" }, picker, h("span", {}, tr(label)), text);
    };
    const fontRow = (which, label, fallback) => {
      const f = font(t[which], fallback);
      const custom = h("input", { class: "field-input", placeholder: tr("Font name, e.g. Inter"), value: f.custom || "", hidden: !!f.preset,
        onchange: (e) => update((x) => { x[which] = { custom: e.target.value.trim(), google: !!google.checked }; }) });
      const google = h("input", { type: "checkbox", checked: !!f.google, onchange: () => update((x) => { x[which] = { custom: custom.value.trim(), google: google.checked }; }) });
      const googleRow = h("label", { class: "check-row", hidden: !!f.preset }, google, tr("Load it from Google Fonts (otherwise it must be installed on this Mac)"));
      return h("div", { class: "font-row" },
        h("span", { class: "appearance-label" }, tr(label)),
        h("select", { class: "field-input", "aria-label": tr(label), onchange: (e) => {
          if (e.target.value === "custom") { custom.hidden = false; googleRow.hidden = false; custom.focus(); return; }
          custom.hidden = true; googleRow.hidden = true;
          update((x) => { x[which] = e.target.value; });
        } },
          Object.entries(FONTS).map(([k, v]) => h("option", { value: k, selected: f.preset === k }, v.label)),
          h("option", { value: "custom", selected: !f.preset }, tr("Other font…"))),
        custom, googleRow);
    };
    return h("div", { class: "theme-editor" },
      h("div", { class: "appearance-row two" },
        h("label", {}, h("span", { class: "appearance-label" }, tr("Name")), h("input", { class: "field-input", value: t.name, onchange: (e) => { update((x) => { x.name = e.target.value || tr("Untitled"); }); draw(); } })),
        h("div", {}, h("span", { class: "appearance-label" }, tr("Used for")),
          h("div", { class: "segmented", role: "group", "aria-label": tr("Light or dark") },
            [["light", tr("Light mode")], ["dark", tr("Dark mode")]].map(([k, label]) => h("button", { class: t.kind === k ? "on" : "", onclick: () => {
              const was = t.kind === "dark" ? "wip-theme-dark" : "wip-theme-light";
              if (read(was) === t.id) write(was, t.kind);   // its old mode goes back to the built-in theme
              update((x) => { x.kind = k; });
              write(k === "dark" ? "wip-theme-dark" : "wip-theme-light", t.id);
              draw();
            } }, label))))),
      h("div", { class: "appearance-label" }, tr("Colors")),
      h("div", { class: "color-grid" }, COLORS.map(colorRow)),
      h("div", { class: "appearance-row two" },
        h("label", {}, h("span", { class: "appearance-label" }, tr("Code colors (Source view and HTML)")),
          h("select", { class: "field-input", onchange: (e) => update((x) => { x.code = e.target.value; }) },
            [["ayu-dark", "Ayu Dark"], ["ayu-light", "Ayu Light"]].map(([v, l]) => h("option", { value: v, selected: (t.code || "ayu-dark") === v }, l)))),
        h("label", {}, h("span", { class: "appearance-label" }, tr("Writing size: {n}px", { n: t.size || 16 })),
          h("input", { type: "range", min: 14, max: 22, step: 1, value: t.size || 16, oninput: (e) => { update((x) => { x.size = Number(e.target.value); }); e.target.previousSibling.textContent = tr("Writing size: {n}px", { n: e.target.value }); } }))),
      fontRow("font", "Interface font", "system"),
      fontRow("writing", "Writing font (titles and text)", "system"),
      fontRow("mono", "Code font (Source view)", "mono"));
  }
  draw();
}
