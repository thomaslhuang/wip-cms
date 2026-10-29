// The Settings window (⋯ → Settings…): things about how w·i·p cms works for you, rather than
// how it looks (that's Customize, in theme.js).
//
//   Language        English or 日本語 (w·i·p cms reloads to switch)
//   Date format     October 28, 2026 · 2026年10月28日
//   Interface Size  scales the sidebar, list, toolbar and inspector
//   Typographer's quotes   "straight" quotes and apostrophes become “curly” ones as you type
//   Save after      how long after you stop typing it saves (⌘S always saves straight away)
//   When it opens   the last site, or the list of sites
//   Advanced tools  the spreadsheet view in lists (editing many entries at once, pasting rows
//                   from a spreadsheet)
//   Site            which site is open, its nickname, and opening another
//
// Everything is kept in this browser, like the themes.
import { h, fill, toast } from "./util.js";
import { api } from "./api.js";
import { t, tl, fmtDate, lang, setLang, dateStyle, setDateStyle } from "./i18n.js";
import { uiScale, setUiScale } from "./theme.js";

// ---------- the settings other parts of w·i·p cms read ----------
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private window */ } };
export const smartQuotes = () => read("wip-smart-quotes", "off") === "on";
// seconds after the last change before it saves by itself
export const saveAfter = () => { const n = Number(read("wip-save-after", "1.2")); return isFinite(n) && n >= 0.2 ? Math.min(n, 600) : 1.2; };
export const advancedTools = () => read("wip-advanced", "off") === "on";
export const onLaunch = () => (read("wip-on-launch", "last") === "list" ? "list" : "last");

// beforeReload: save anything open first · onDates: redraw what shows dates · site: the open site
// openSite: show the "Open a site" window
export function openSettings({ beforeReload, onDates, site, openSite, onRename, onAdvanced }) {
  const body = h("div", { class: "custom-body" });
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dialog custom-dialog settings-dialog", role: "dialog", "aria-label": tl("Settings") },
      h("div", { class: "custom-head" },
        h("span", { class: "custom-title" }, tl("Settings")),
        h("span", {}),
        h("button", { class: "btn primary", onclick: close }, t("Done"))),
      body));
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);

  const group = (title, ...rows) => h("section", { class: "set-section" }, h("h3", { class: "set-title" }, tl(title)), h("div", { class: "set-group" }, rows));
  const row = (label, ...controls) => h("div", { class: "set-row" }, h("span", { class: "set-label" }, label), h("div", { class: "set-control" }, controls));
  const dropdown = (label, options, current, onpick) => h("select", { class: "set-select", "aria-label": label, onchange: (e) => onpick(e.target.value) },
    options.map(([value, text]) => h("option", { value, selected: value === current }, text)));
  const toggle = (on, onchange) => {
    const sw = h("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(on),
      onclick: () => { on = !on; sw.setAttribute("aria-checked", String(on)); onchange(on); } }, h("span", { class: "knob" }));
    return sw;
  };
  const hint = (text) => h("p", { class: "set-hint" }, text);

  function draw() {
    const scale = uiScale();
    const value = h("span", { class: "set-value" }, scale + "%");
    const range = h("input", { type: "range", class: "set-range", min: 85, max: 130, step: 5, value: scale, "aria-label": tl("Interface size"),
      oninput: (e) => { setUiScale(Number(e.target.value)); value.textContent = e.target.value + "%"; reset.disabled = Number(e.target.value) === 100; } });
    const reset = h("button", { class: "btn small", disabled: scale === 100, onclick: () => { setUiScale(100); draw(); } }, t("Reset"));
    fill(body,
      group("General",
        row(tl("Language"), dropdown(tl("Language"), [["en", "English"], ["ja", "日本語"]], lang(), async (l) => {
          if (l === lang()) return;
          await beforeReload?.();
          setLang(l);
          location.reload();
        })),
        // each format shown with today's date
        row(tl("Date format"), dropdown(tl("Date format"), ["western", "japanese"].map((s) => [s, fmtDate(new Date(), "long", s)]), dateStyle(), (s) => { setDateStyle(s); onDates?.(); draw(); })),
        row(tl("Interface size"), h("span", { class: "set-a small", "aria-hidden": "true" }, "A"), range, h("span", { class: "set-a", "aria-hidden": "true" }, "A"), value, reset),
        // saving applies to everything you edit, so it's here rather than under Writing
        row(tl("Save after"), h("input", { class: "set-input set-number", type: "text", inputmode: "decimal", value: saveAfter(), "aria-label": tl("Save after"),
          onchange: (e) => { const n = Number(String(e.target.value).replace(",", ".")); if (isFinite(n) && n >= 0.2) write("wip-save-after", Math.min(n, 600)); e.target.value = saveAfter(); },
          onkeydown: (e) => { if (e.key === "Enter") e.target.blur(); } }),
          h("span", { class: "set-unit" }, t("seconds without typing")))),
      hint(t("Switching language reloads w·i·p cms. Interface size makes the sidebar, list, toolbar and inspector bigger or smaller; the writing has its own size, in Customize → Typography. ⌘S always saves straight away.")),
      group("Writing",
        row(tl("Use typographer's quotes"), toggle(smartQuotes(), (on) => write("wip-smart-quotes", on ? "on" : "off")))),
      hint(t("\" and ' become “ ” and ‘ ’ as you type (apostrophes too), as in InDesign. Not in Source, HTML or web addresses.")),
      group("Starting up",
        row(tl("When w·i·p cms opens"), dropdown(tl("When w·i·p cms opens"), [["last", t("Open the last site")], ["list", t("Show the list of sites")]], onLaunch(), (v) => write("wip-on-launch", v)))),
      group("Advanced",
        row(tl("Advanced tools"), toggle(advancedTools(), (on) => { write("wip-advanced", on ? "on" : "off"); onAdvanced?.(on); }))),
      hint(t("Adds a spreadsheet view to lists: every entry as a row, edited right in the cells, and rows pasted in from Google Sheets, Numbers or Excel. Handy for lots of entries at once; the writing and pictures still open in the editor.")),
      site ? group("Site",
        row(h("span", { class: "set-site" }, h("b", {}, site.name), h("span", { class: "muted" }, site.root)),
          h("button", { class: "btn small", onclick: () => { close(); openSite(); } }, tl("Open another site…"))),
        row(tl("Nickname"), h("input", { class: "set-input", value: site.nickname || "", placeholder: site.folder || "",
          onchange: async (e) => { try { const r = await api.setNickname(site.root, e.target.value); site.nickname = r.nickname; site.name = r.nickname || site.folder; onRename?.(); draw(); } catch (err) { toast(err.message, "error"); } } }))) : null,
      site ? hint(t("Your own name for this site, shown in the sidebar and the list of recent sites instead of its folder's name. Only on this Mac; the site itself doesn't change.")) : null);
  }
  draw();
}
