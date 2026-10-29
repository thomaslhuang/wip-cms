// The Settings window (⋯ → Settings…): things about how w·i·p cms works for you, rather than
// how it looks (that's Customize, in theme.js).
//
//   Language        English or 日本語 (w·i·p cms reloads to switch)
//   Dates           October 28, 2026 · 2026年10月28日
//   Interface Size  scales the sidebar, list, toolbar and inspector
//   Site            which site is open, and opening another
//
// Everything is kept in this browser, like the themes.
import { h, fill, toast } from "./util.js";
import { api } from "./api.js";
import { t, tl, fmtDate, lang, setLang, dateStyle, setDateStyle } from "./i18n.js";
import { uiScale, setUiScale } from "./theme.js";

// beforeReload: save anything open first · onDates: redraw what shows dates · site: the open site
// openSite: show the "Open a site" window
export function openSettings({ beforeReload, onDates, site, openSite, onRename }) {
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
  const choice = (label, options, current, onpick) => h("div", { class: "segmented", role: "group", "aria-label": label },
    options.map(([value, text]) => h("button", { class: value === current ? "on" : "", "aria-pressed": String(value === current), onclick: () => onpick(value) }, text)));
  const hint = (text) => h("p", { class: "set-hint" }, text);

  function draw() {
    const scale = uiScale();
    const value = h("span", { class: "set-value" }, scale + "%");
    const range = h("input", { type: "range", class: "set-range", min: 85, max: 130, step: 5, value: scale, "aria-label": tl("Interface size"),
      oninput: (e) => { setUiScale(Number(e.target.value)); value.textContent = e.target.value + "%"; reset.disabled = Number(e.target.value) === 100; } });
    const reset = h("button", { class: "btn small", disabled: scale === 100, onclick: () => { setUiScale(100); draw(); } }, t("Reset"));
    fill(body,
      group("General",
        row(tl("Language"), choice(tl("Language"), [["en", "English"], ["ja", "日本語"]], lang(), async (l) => {
          if (l === lang()) return;
          await beforeReload?.();
          setLang(l);
          location.reload();
        })),
        row(tl("Dates"), choice(tl("Dates"), ["western", "japanese"].map((s) => [s, fmtDate(new Date(), "long", s)]), dateStyle(), (s) => { setDateStyle(s); onDates?.(); draw(); })),
        row(tl("Interface size"), h("span", { class: "set-a small", "aria-hidden": "true" }, "A"), range, h("span", { class: "set-a", "aria-hidden": "true" }, "A"), value, reset)),
      hint(t("Switching language reloads w·i·p cms. Interface Size makes the sidebar, list, toolbar and inspector bigger or smaller; the writing has its own size, in Customize → Typography.")),
      site ? group("Site",
        row(h("span", { class: "set-site" }, h("b", {}, site.name), h("span", { class: "muted" }, site.root)),
          h("button", { class: "btn small", onclick: () => { close(); openSite(); } }, tl("Open another site…"))),
        row(tl("Nickname"), h("input", { class: "set-input", value: site.nickname || "", placeholder: site.folder || "",
          onchange: async (e) => { try { const r = await api.setNickname(site.root, e.target.value); site.nickname = r.nickname; site.name = r.nickname || site.folder; onRename?.(); draw(); } catch (err) { toast(err.message, "error"); } } }))) : null,
      site ? hint(t("Your own name for this site, shown in the sidebar and the list of recent sites instead of its folder's name. Only on this Mac; the site itself doesn't change.")) : null);
  }
  draw();
}
